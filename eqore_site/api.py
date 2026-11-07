"""HTTP API + static UI.

Run:  .venv/bin/uvicorn eqore_site.api:app --reload      then open http://127.0.0.1:8000/

Endpoints (JSON):
  POST   /site-record                  {address, proposed_system?, confirmed_apn?}  -> record
  GET    /site-record/{id}                                                          -> record
  POST   /site-record/{id}/confirm     {apn, confirmed_by?, relocate?=true}          -> recomputed record
  POST   /site-record/{id}/pin         {lat, lon, apn?, placed_by?}                  -> record
  DELETE /site-record/{id}/pin                                                      -> record
  POST   /site-record/{id}/values      {values: {field_id: value}, entered_by?}      -> record
  GET    /site-record/{id}/prefill     ?format=json|csv                              -> permit/lead-form prefill
  GET    /schema                                                                    -> JSON Schema
  GET    /health

Records live in memory (and are mirrored to EQORE_RECORD_DIR if set). Pins and
entered values are kept as an edit log and re-applied when /confirm rebuilds.

HTTP mode (env EQORE_HTTP_MODE):
  cache (default)  stored responses first (.cache/http, plus tests/fixtures/* unless
                   EQORE_FIXTURE_CACHE=0), live fetch otherwise
  replay           fixtures/cache only, no network (offline demo)
  live             always fetch
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .edit import clear_bess, enter_values, place_bess
from .http import HttpClient
from .pipeline import build_confirmed_record, build_site_record
from .prefill import to_csv
from .schema import ProposedSystem, SiteRecord

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def default_client() -> HttpClient:
    mode = os.environ.get("EQORE_HTTP_MODE", "cache")
    cache = Path(os.environ.get("EQORE_HTTP_CACHE", ROOT / ".cache" / "http"))
    reads = []
    if os.environ.get("EQORE_FIXTURE_CACHE", "1") != "0" and (ROOT / "tests" / "fixtures").exists():
        reads = sorted(p for p in (ROOT / "tests" / "fixtures").iterdir() if p.is_dir())
    if mode == "live":
        return HttpClient("live")
    return HttpClient(mode, cache, read_dirs=reads)  # type: ignore[arg-type]


class CreateReq(BaseModel):
    address: str
    proposed_system: Optional[ProposedSystem] = None
    confirmed_apn: Optional[str] = None


class ConfirmReq(BaseModel):
    apn: str
    confirmed_by: str = "customer"
    relocate: bool = True


class PinReq(BaseModel):
    lat: float
    lon: float
    apn: Optional[str] = None
    placed_by: str = "customer"


class ValuesReq(BaseModel):
    values: dict[str, Any]
    entered_by: str = "customer"


class Store:
    """In-memory record store with an edit log per record."""

    def __init__(self, mirror_dir: Optional[Path] = None):
        self.items: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.mirror_dir = mirror_dir

    def put(self, rid: str, rec: SiteRecord, **meta) -> SiteRecord:
        rec.record_id = rid
        with self.lock:
            item = self.items.setdefault(rid, {"pin": None, "values": {}, "entered_by": {}})
            item.update(meta, record=rec)
        if self.mirror_dir:
            self.mirror_dir.mkdir(parents=True, exist_ok=True)
            (self.mirror_dir / f"{rid}.json").write_text(rec.model_dump_json(indent=1))
        return rec

    def get(self, rid: str) -> dict:
        if rid not in self.items:
            raise HTTPException(404, f"no record {rid}")
        return self.items[rid]


def create_app(client_factory: Callable[[], HttpClient] = default_client, today: Optional[str] = None) -> FastAPI:
    app = FastAPI(title="EQORE site record", version="0.1.0",
                  description="Address + proposed BESS -> source-tagged site record (California / Bay Area).")
    mirror = os.environ.get("EQORE_RECORD_DIR")
    store = Store(Path(mirror) if mirror else None)
    app.state.store = store

    def _client():
        return client_factory()

    def _reapply(item: dict, rec: SiteRecord) -> SiteRecord:
        if item.get("values"):
            for who, vals in _group_by_who(item).items():
                rec = enter_values(rec, vals, entered_by=who, today=today)
        if item.get("pin"):
            p = item["pin"]
            try:
                rec = place_bess(rec, p["lat"], p["lon"], placed_by=p.get("placed_by", "customer"), today=today)
            except ValueError:
                pass
        return rec

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/schema")
    def schema():
        return SiteRecord.json_schema()

    @app.post("/site-record")
    def create(req: CreateReq) -> dict:
        client = _client()
        try:
            rec = build_site_record(req.address, req.proposed_system, client=client, today=today,
                                    confirmed_apn=req.confirmed_apn)
        finally:
            client.close()
        rid = uuid.uuid4().hex[:12]
        return store.put(rid, rec, address=req.address, proposed=req.proposed_system).model_dump()

    @app.get("/site-record/{rid}")
    def read(rid: str) -> dict:
        return store.get(rid)["record"].model_dump()

    @app.post("/site-record/{rid}/confirm")
    def confirm(rid: str, req: ConfirmReq) -> dict:
        item = store.get(rid)
        client = _client()
        try:
            if req.relocate:
                rec = build_confirmed_record(item["address"], req.apn, item.get("proposed"), client=client,
                                             confirmed_by=req.confirmed_by, today=today)
            else:
                rec = build_site_record(item["address"], item.get("proposed"), client=client, today=today,
                                        confirmed_apn=req.apn, confirmed_by=req.confirmed_by)
        finally:
            client.close()
        return store.put(rid, _reapply(item, rec)).model_dump()

    @app.get("/site-record/{rid}/prefill")
    def prefill(rid: str, format: str = "json"):
        rec = store.get(rid)["record"]
        if format == "csv":
            name = f"prefill-{rec.confirmed_apn or rid}.csv".replace("/", "-")
            return Response(to_csv(rec), media_type="text/csv",
                            headers={"Content-Disposition": f'attachment; filename="{name}"'})
        return {"record_id": rid, "status": rec.status, "counts": rec.summary.get("prefill"),
                "items": [i.model_dump() for i in rec.form_prefill]}

    @app.post("/site-record/{rid}/pin")
    def pin(rid: str, req: PinReq) -> dict:
        item = store.get(rid)
        rec = place_bess(item["record"], req.lat, req.lon, apn=req.apn, placed_by=req.placed_by, today=today)
        item["pin"] = req.model_dump()
        return store.put(rid, rec).model_dump()

    @app.delete("/site-record/{rid}/pin")
    def unpin(rid: str) -> dict:
        item = store.get(rid)
        item["pin"] = None
        return store.put(rid, clear_bess(item["record"], today=today)).model_dump()

    @app.post("/site-record/{rid}/values")
    def values(rid: str, req: ValuesReq) -> dict:
        item = store.get(rid)
        try:
            rec = enter_values(item["record"], req.values, entered_by=req.entered_by, today=today)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        for k, v in req.values.items():
            item["values"][k] = v
            item["entered_by"][k] = req.entered_by
        return store.put(rid, rec).model_dump()

    if WEB.exists():
        app.mount("/web", StaticFiles(directory=WEB), name="web")

        @app.get("/")
        def index():
            return FileResponse(WEB / "index.html")

    return app


def _group_by_who(item: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for k, v in item["values"].items():
        out.setdefault(item["entered_by"].get(k, "customer"), {})[k] = v
    return out


app = create_app()


if __name__ == "__main__":  # pragma: no cover
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
