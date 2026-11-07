"""Write permits.json/csv, attachments.csv/json, missing.json and records_request.md."""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import TYPE_CHECKING

from .models import Attachment, PermitRecord, utcnow

if TYPE_CHECKING:
    from .pipeline import Result

RECORD_COLS = list(PermitRecord.model_fields.keys() - {"source_id", "source_key"})
RECORD_COLS = [c for c in PermitRecord.model_fields if c not in ("source_id", "source_key")]
ATT_COLS = list(Attachment.model_fields)


def write_outputs(out_dir: Path, res: "Result", request_md: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    recs = [r.model_dump() for r in res.records]
    (out_dir / "permits.json").write_text(json.dumps({"site": res.site.model_dump(), "jurisdiction": res.jurisdiction,
                                                      "generated_at": utcnow(), "count": len(recs), "records": recs}, indent=2))
    with (out_dir / "permits.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=RECORD_COLS)
        w.writeheader()
        for r in recs:
            w.writerow({**r, "extracted": json.dumps(r["extracted"]) if r["extracted"] else ""})
    atts = [a.model_dump() for a in res.attachments]
    (out_dir / "attachments.json").write_text(json.dumps(atts, indent=2))
    with (out_dir / "attachments.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ATT_COLS)
        w.writeheader()
        w.writerows(atts)
    (out_dir / "missing.json").write_text(json.dumps([m.model_dump() for m in res.missing], indent=2))
    (out_dir / "records_request.md").write_text(request_md)
