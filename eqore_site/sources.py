"""Registry of data sources: label, endpoint, stated vintage and license.

Live status per endpoint is tracked in docs/DATA_SOURCES.md, not here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Source:
    key: str
    label: str
    url: str
    vintage: Optional[str] = None
    license: str = "not stated"


_S = [
    Source("census_geocoder", "US Census Geocoder",
           "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress",
           "Public_AR_Current benchmark", "US federal public domain"),
    Source("boe_cities", "CA city boundaries (DOC mirror of CDTFA/BOE)",
           "https://gis.conservation.ca.gov/server/rest/services/Base/Base_BOECities/FeatureServer/0",
           "not stated (tax-rate-area based)"),
    Source("calfire_fire_districts", "CAL FIRE local fire districts",
           "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Local_Fire_Districts/FeatureServer/0"),
    Source("calfire_fhsz", "CAL FIRE fire hazard severity zones",
           "https://services1.arcgis.com/P5Mv5GY5S66M8Z1Q/ArcGIS/rest/services/Fire_Hazard_Severity/FeatureServer/0",
           "state zones 2024-04-01; local zones 2007-2011 (interim)"),
    Source("cgs_tsunami", "CGS tsunami hazard area",
           "https://gis.conservation.ca.gov/server/rest/services/CGS/IW_Tsunami_Hazard_Area/FeatureServer/0"),
    Source("cgs_liquefaction", "CGS liquefaction zones of required investigation",
           "https://services.gis.ca.gov/arcgis/rest/services/GeoscientificInformation/Liquefaction/MapServer/0"),
    Source("usgs_seismic", "USGS Seismic Design Web Services (ASCE 7-22)",
           "https://earthquake.usgs.gov/ws/building-codes/asce7-22/calculate",
           None, "US federal public domain"),
    Source("cec_lse", "CEC electric load serving entities",
           "https://services3.arcgis.com/bWPjFyq029ChCGur/ArcGIS/rest/services/ElectricLoadServingEntities_IOU_POU/FeatureServer/0"),
    Source("pge_grip_feeders", "PG&E GRIP feeder detail",
           "https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer/2"),
    Source("naip_2022", "CDFW NAIP 2022 4-band ImageServer (60 cm)",
           "https://gis.wildlife.ca.gov/images/rest/services/Base_Remote_Sensing/NAIP_2022_4Band/ImageServer",
           "2022"),
    Source("abag_zoning_draft", "ABAG/MTC Draft Bay Area Zoning 2023",
           "https://services3.arcgis.com/i2dkYWmb4wHvYPda/ArcGIS/rest/services/Draft_Bay_Area_Zoning_2023/FeatureServer/0",
           "draft 2023", "not stated; draft, no warranty"),
    Source("dwr_lightbox_parcels", "DWR statewide assessor parcels (LightBox)",
           "https://gis.water.ca.gov/arcgis/rest/services/planning/i15_Parcels_Assessor_Lightbox/MapServer/0",
           "quarterly per layer description; date not stated", "not stated; originator LightBox"),
    Source("bsc_bulletin_25_01", "CA Building Standards Commission bulletin 25-01",
           "https://www.dgs.ca.gov/BSC", "2025 Title 24, effective 2026-01-01"),
    Source("fema_nfhl", "FEMA National Flood Hazard Layer",
           "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer"),
    Source("sf_parcels", "San Francisco parcels, active and retired (DataSF acdm-wktn)",
           "https://data.sf.gov/resource/acdm-wktn.json", None, "ODC PDDL (public domain)"),
    Source("sf_footprints", "San Francisco building footprints (DataSF ynuv-fyni)",
           "https://data.sf.gov/resource/ynuv-fyni.json", "2010 Pictometry model, refined; data_as_of 2023-09-11",
           "ODC PDDL (public domain)"),
    Source("sf_benchmark", "SF Existing Buildings Energy Performance Ordinance report (DataSF 96ck-qcfe)",
           "https://data.sf.gov/resource/96ck-qcfe.json", None, "ODC PDDL (public domain)"),
    Source("sf_permits", "SF DBI building permits (DataSF i98e-djp9)",
           "https://data.sf.gov/resource/i98e-djp9.json", None, "ODC PDDL (public domain)"),
    Source("coh_parcels", "City of Hayward parcels (COH_Parcels)",
           "https://maps.hayward-ca.gov/arcgis/rest/services/OpenData/COH_Parcels/FeatureServer/0",
           None, "not stated (copyright: City of Hayward)"),
    Source("coh_addresses", "City of Hayward address points (COH_Addresses)",
           "https://maps.hayward-ca.gov/arcgis/rest/services/OpenData/COH_Addresses/FeatureServer/0",
           None, "not stated (copyright: City of Hayward)"),
    Source("coh_footprints", "City of Hayward building footprints (COH_BuildingFootprints)",
           "https://maps.hayward-ca.gov/arcgis/rest/services/OpenData/COH_BuildingFootprints/FeatureServer/0",
           None, "not stated (copyright: City of Hayward)"),
    Source("coh_zoning", "City of Hayward zoning (COH_Zoning)",
           "https://maps.hayward-ca.gov/arcgis/rest/services/OpenData/COH_Zoning/FeatureServer/0",
           None, "not stated (copyright: City of Hayward)"),
    Source("massgis_parcels", "MassGIS Property Tax Parcels (assessor data joined)",
           "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0",
           None, "not stated on the service; MassGIS data are public records"),
    Source("massgis_structures", "MassGIS Building Structures (2-D)",
           "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Building_Structures/FeatureServer/0",
           None, "not stated on the service"),
    Source("massgis_electric", "MassGIS Electric Utility Providers by town",
           "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0",
           None, "not stated on the service"),
    Source("facility_list", "EQORE facility list (customer-provided)", "", None, "EQORE internal"),
    Source("lead_form", "Lead form (as entered)", "", None, "customer-provided"),
    Source("eqore_ahj_table", "EQORE AHJ table", "eqore_site/ahj/ahj_table.csv", None, "EQORE-owned"),
    Source("user_entry", "Entered by a person", "", None, "n/a"),
    Source("confirmation", "Confirmed by a person", "", None, "n/a"),
    Source("computed", "Computed by this tool", "", None, "n/a"),
]

SOURCES: dict[str, Source] = {s.key: s for s in _S}
