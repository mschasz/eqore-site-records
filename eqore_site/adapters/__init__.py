"""County/city adapters, registered by 5-digit county FIPS.

An adapter is `run(ctx) -> None`. It adds parcel candidates (via
`resolve.add_candidate`, each with parcel-level `fields`), record fields, flags
and source statuses. The pipeline guards each adapter: an exception becomes a
`source_errors` entry, never a crash. Counties with no adapter get a `missing`
note and rely on the statewide layers."""

from __future__ import annotations

from typing import Callable

from ..context import Ctx
from . import alameda, sf

ADAPTERS: dict[str, tuple[str, Callable[[Ctx], None]]] = {
    "06075": ("sf_parcels", sf.run),
    "06001": ("coh_parcels", alameda.run),   # Hayward only; other Alameda cities fall back
}
