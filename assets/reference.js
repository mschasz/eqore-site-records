/* Public reference data, gathered 2026-11-07 from utility tariff books, interconnection tariffs,
   Mass Save, DOER (225 CMR 21), SGIP program metrics, NFPA/ICC, CA BSC, NREL ComStock and municipal portals. */
window.EQ_PUBLIC = {
 "asOf": "2026-11-07",
 "tariffs": {
  "PG&E B-19": {
   "name": "PG&E B-19 Medium General Demand-Metered TOU (secondary)",
   "effective": "2026-03-01",
   "url": "https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_B-19.pdf",
   "sourceLabel": "PG&E tariff book",
   "summerMonths": [
    6,
    7,
    8,
    9
   ],
   "components": [
    {
     "label": "Max demand (all hours)",
     "rate": {
      "summer": 37.37,
      "winter": 37.37
     },
     "windows": null
    },
    {
     "label": "Peak demand 4–9 pm",
     "rate": {
      "summer": 46.16,
      "winter": 2.31
     },
     "windows": [
      [
       16,
       21
      ]
     ]
    },
    {
     "label": "Part-peak demand 2–4 pm, 9–11 pm",
     "rate": {
      "summer": 10.52,
      "winter": 0
     },
     "windows": [
      [
       14,
       16
      ],
      [
       21,
       23
      ]
     ]
    }
   ],
   "energy": {
    "summer": {
     "peak": 0.18648,
     "offPeak": 0.12037
    },
    "winter": {
     "peak": 0.16188,
     "offPeak": 0.12026
    }
   },
   "touNote": "Summer Jun–Sep: peak 4–9 pm daily, part-peak 2–4 pm and 9–11 pm. Winter: peak 4–9 pm."
  },
  "PG&E B-20": {
   "name": "PG&E B-20 Service to Max Demands ≥1,000 kW (secondary)",
   "effective": "2026-03-01",
   "url": "https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_B-20.pdf",
   "sourceLabel": "PG&E tariff book",
   "summerMonths": [
    6,
    7,
    8,
    9
   ],
   "components": [
    {
     "label": "Max demand (all hours)",
     "rate": {
      "summer": 39.08,
      "winter": 39.08
     },
     "windows": null
    },
    {
     "label": "Peak demand 4–9 pm",
     "rate": {
      "summer": 41.35,
      "winter": 2.32
     },
     "windows": [
      [
       16,
       21
      ]
     ]
    },
    {
     "label": "Part-peak demand 2–4 pm, 9–11 pm",
     "rate": {
      "summer": 9.27,
      "winter": 0
     },
     "windows": [
      [
       14,
       16
      ],
      [
       21,
       23
      ]
     ]
    }
   ],
   "energy": {
    "summer": {
     "peak": 0.17702,
     "offPeak": 0.11482
    },
    "winter": {
     "peak": 0.15632,
     "offPeak": 0.1146
    }
   },
   "touNote": "Summer Jun–Sep: peak 4–9 pm daily, part-peak 2–4 pm and 9–11 pm. Winter: peak 4–9 pm."
  },
  "Eversource G-2": {
   "name": "Eversource Greater Boston G-2 (M.D.P.U. No. 15I)",
   "effective": "Rate summary eff. 2026-09-01",
   "url": "https://www.eversource.com/content/docs/default-source/rates-tariffs/ema-greater-boston-rates.pdf",
   "sourceLabel": "Eversource rate summary",
   "summerMonths": [
    6,
    7,
    8,
    9
   ],
   "components": [
    {
     "label": "Distribution + transmission demand (off-peak demand counted at 45%)",
     "rate": {
      "summer": 33.95,
      "winter": 33.95
     },
     "windows": {
      "summer": [
       [
        9,
        18
       ]
      ],
      "winter": [
       [
        8,
        21
       ]
      ]
     },
     "offPeakFactor": 0.45
    }
   ],
   "touNote": "Peak: Jun–Sep 9 am–6 pm weekdays; Oct–May 8 am–9 pm weekdays."
  },
  "Eversource G-3": {
   "name": "Eversource Greater Boston G-3 (M.D.P.U. No. 13I, ≥14 kV)",
   "effective": "Rate summary eff. 2026-09-01",
   "url": "https://www.eversource.com/content/docs/default-source/rates-tariffs/ema-greater-boston-rates.pdf",
   "sourceLabel": "Eversource rate summary",
   "summerMonths": [
    6,
    7,
    8,
    9
   ],
   "components": [
    {
     "label": "Distribution + transmission demand (off-peak demand counted at 30%)",
     "rate": {
      "summer": 30.05,
      "winter": 30.05
     },
     "windows": {
      "summer": [
       [
        9,
        18
       ]
      ],
      "winter": [
       [
        8,
        21
       ]
      ]
     },
     "offPeakFactor": 0.3
    }
   ],
   "touNote": "Peak: Jun–Sep 9 am–6 pm weekdays; Oct–May 8 am–9 pm weekdays."
  },
  "National Grid G-3": {
   "name": "National Grid MA G-3 Time-of-Use (M.D.P.U. No. 1591)",
   "effective": "Delivery rates eff. 2026-07-01",
   "url": "https://www.nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/meco_g3.pdf",
   "sourceLabel": "National Grid tariff",
   "summerMonths": [
    6,
    7,
    8,
    9
   ],
   "components": [
    {
     "label": "Distribution demand, peak hours 8 am–9 pm weekdays",
     "rate": {
      "summer": 10.48,
      "winter": 10.48
     },
     "windows": [
      [
       8,
       21
      ]
     ]
    }
   ],
   "energy": {
    "summer": {
     "peak": 0.07123,
     "offPeak": 0.06853
    }
   },
   "touNote": "Peak 8 am–9 pm weekdays. Transmission billed per kWh; supply separate.",
   "caveat": "A later summary (e.g., Oct/Nov 2026 RDM update; M.D.P.U. No. 1635 RDM eff. 2026-10-01 reported in search) may supersede $10.48/kW; the 0826–1126 monthly PDFs were not published at the guessed URLs."
  }
 },
 "interconnection": {
  "PG&E": {
   "name": "PG&E Electric Rule 21",
   "short": "Rule 21",
   "url": "https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_RULES_21.pdf",
   "summary": "Non-export storage ≤500 kW: Section N expedited. Otherwise Fast Track: $800 request fee, Initial Review 15 BD, Supplemental Review 20 BD ($2,500).",
   "trackFor": {
    "le500": "Sec. N non-export",
    "gt500": "Fast Track"
   }
  },
  "National Grid": {
   "name": "National Grid MA SIDG, M.D.P.U. No. 1632 (eff. May 1, 2026)",
   "short": "SIDG No. 1632",
   "url": "https://www.nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/2026/mdpu_1632_dg_interconnection_tariff.pdf",
   "summary": "Expedited: screens 25 BD, ≤45 BD total (65 with Supplemental Review). Fee $4.50/kW, $300–$7,500. Non-export via reverse/min-power relay.",
   "track": "Expedited"
  },
  "Eversource": {
   "name": "Eversource MA SIDG, M.D.P.U. No. 55F (eff. Nov 1, 2026)",
   "short": "SIDG No. 55F",
   "url": "https://www.eversource.com/docs/default-source/rates-tariffs/ma-electric/55-tariff-ma.pdf",
   "summary": "Expedited: screens 25 BD, ≤45 BD total (65 with Supplemental Review). Fee $4.50/kW, $300–$7,500. Non-export via reverse/min-power relay.",
   "track": "Expedited"
  }
 },
 "programs": {
  "connectedSolutions": {
   "dailyPerKw": 200,
   "targetedPerKw": 35,
   "season": "Jun–Sep, 30–60 events, 2–3 h within 3–8 pm",
   "url": "https://www.masssave.com/-/media/Files/PDFs/Business/CI-ConnectedSolutions-Offering-Materials_June-2023.pdf",
   "sourceLabel": "Mass Save offering materials (Jun 2023)",
   "caveat": "Most recent C&I offering document is dated June 8, 2023; 2025–2027 rates may differ.",
   "lock": "5-year rate lock for new batteries"
  },
  "cleanPeak": {
   "url": "https://www.law.cornell.edu/regulations/massachusetts/225-CMR-21-05",
   "sourceLabel": "225 CMR 21.05",
   "windows": {
    "spring": {
     "dates": "Mar 1–May 14",
     "hours": "17:00–21:00"
    },
    "summer": {
     "dates": "May 15–Sep 14",
     "hours": "16:00–20:00"
    },
    "fall": {
     "dates": "Sep 15–Nov 30",
     "hours": "16:00–20:00"
    },
    "winter": {
     "dates": "Dec 1–Feb 28",
     "hours": "16:00–20:00"
    }
   },
   "multipliers": {
    "spring": 1,
    "summer": 4,
    "fall": 1,
    "winter": 4
   },
   "qualify": "Storage qualifies if co-located with RPS-qualified generation ≥75% of storage nameplate, contractually paired, charged in high-renewable windows, or per ISA schedule.",
   "businessDays": {
    "spring": 53,
    "summer": 87,
    "fall": 54,
    "winter": 62
   }
  },
  "sgip": {
   "ratePerWh": 0.25,
   "ratePerWhITC": 0.18,
   "step": 5,
   "status": "Closed",
   "url": "https://www.selfgenca.com/home/program_metrics/",
   "sourceLabel": "SGIP program metrics (Nov 7, 2026)"
  }
 },
 "codes": [
  {
   "code": "NFPA 855 (2026)",
   "scope": "Stationary ESS installation; free read-only access",
   "url": "https://link.nfpa.org/free-access/publications/855/2026"
  },
  {
   "code": "2024 IFC §1207 (basis of 2025 CFC)",
  "region": "ca",
   "scope": "Outdoor: 10 ft to lot lines/exposures (3 ft with barrier); 50 kWh groups, 3 ft spacing; UL 9540A",
   "url": "https://codes.iccsafe.org/content/IFC2024V1.0/chapter-12-energy-systems"
  },
  {
   "code": "780 CMR 10th ed.",
   "scope": "MA State Building Code (2021 IBC basis)",
   "url": "https://www.mass.gov/handbook/tenth-edition-of-the-ma-state-building-code-780",
   "region": "ma"
  },
  {
   "code": "527 CMR 1.00",
   "scope": "MA Fire Code (NFPA 1, 2021 ed.)",
   "url": "https://www.mass.gov/info-details/massachusetts-fire-code",
   "region": "ma"
  },
  {
   "code": "527 CMR 12.00",
   "scope": "MA Electrical Code — 2026 NEC for permits after Apr 24, 2026 (Art. 706)",
   "url": "https://www.mass.gov/info-details/massachusetts-electrical-code",
   "region": "ma"
  },
  {
   "code": "2025 CBC / CFC / CEC",
   "scope": "Title 24, effective Jan 1, 2026 (CFC §1207, CEC Art. 706)",
   "url": "https://www.dgs.ca.gov/BSC/Codes",
   "region": "ca"
  }
 ],
 "comstock": {
  "source": "NREL ComStock AMY2018 r3 (Middlesex Co. warehouse)",
  "url": "https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/comstock_amy2018_release_3/timeseries_aggregates/by_county/upgrade=0/county=G2500170/up0-g2500170-warehouse.csv",
  "warehouse_ma": {
   "peak": [
    0.2746,
    0.2684,
    0.268,
    0.2629,
    0.2611,
    0.2587,
    0.2579,
    0.257,
    0.2561,
    0.2558,
    0.2582,
    0.2612,
    0.2684,
    0.2782,
    0.2903,
    0.2978,
    0.3226,
    0.3341,
    0.3529,
    0.3744,
    0.4124,
    0.3994,
    0.4272,
    0.4598,
    0.4901,
    0.5278,
    0.5513,
    0.5908,
    0.627,
    0.6603,
    0.689,
    0.712,
    0.7443,
    0.769,
    0.7931,
    0.8145,
    0.8335,
    0.8554,
    0.8713,
    0.8856,
    0.9004,
    0.913,
    0.9244,
    0.94,
    0.9496,
    0.9599,
    0.9679,
    0.9747,
    0.9825,
    0.989,
    0.9963,
    1.0,
    0.9978,
    0.9937,
    0.9911,
    0.9802,
    0.9674,
    0.9592,
    0.9483,
    0.9348,
    0.8994,
    0.8767,
    0.8528,
    0.8103,
    0.7873,
    0.7423,
    0.7269,
    0.6993,
    0.6619,
    0.6188,
    0.5898,
    0.5538,
    0.5166,
    0.581,
    0.5511,
    0.53,
    0.5131,
    0.4934,
    0.4814,
    0.4664,
    0.4531,
    0.4413,
    0.4301,
    0.4226,
    0.4143,
    0.4004,
    0.3926,
    0.3864,
    0.3768,
    0.3695,
    0.3644,
    0.3565,
    0.292,
    0.287,
    0.2837,
    0.2799
   ],
   "weekday": [
    0.2718,
    0.2705,
    0.2696,
    0.2681,
    0.2677,
    0.2667,
    0.266,
    0.266,
    0.2673,
    0.2687,
    0.2727,
    0.2774,
    0.2887,
    0.3018,
    0.3178,
    0.3293,
    0.356,
    0.3599,
    0.3808,
    0.4031,
    0.4577,
    0.4775,
    0.4979,
    0.5351,
    0.57,
    0.6099,
    0.6319,
    0.6739,
    0.7115,
    0.7438,
    0.7708,
    0.7904,
    0.822,
    0.843,
    0.863,
    0.88,
    0.8947,
    0.9132,
    0.9242,
    0.9333,
    0.9447,
    0.953,
    0.9599,
    0.9723,
    0.9777,
    0.9849,
    0.9893,
    0.9924,
    0.9956,
    0.9976,
    1.0,
    0.9993,
    0.9952,
    0.9906,
    0.9888,
    0.9749,
    0.9586,
    0.9467,
    0.9354,
    0.916,
    0.8735,
    0.8486,
    0.8197,
    0.7729,
    0.7462,
    0.7049,
    0.6839,
    0.6613,
    0.6183,
    0.5775,
    0.5583,
    0.5331,
    0.5123,
    0.497,
    0.4795,
    0.475,
    0.4792,
    0.5012,
    0.4838,
    0.4728,
    0.4572,
    0.4436,
    0.4356,
    0.4284,
    0.419,
    0.4067,
    0.3979,
    0.3922,
    0.3816,
    0.3762,
    0.3691,
    0.3634,
    0.28,
    0.2777,
    0.275,
    0.2732
   ],
   "url": "https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/comstock_amy2018_release_3/timeseries_aggregates/by_county/upgrade=0/county=G2500170/up0-g2500170-warehouse.csv",
   "county": "Middlesex (25017)",
   "models": 174
  },
  "warehouse_ca": {
   "peak": [
    0.855,
    0.849,
    0.8468,
    0.8451,
    0.8434,
    0.842,
    0.8409,
    0.8403,
    0.4464,
    0.446,
    0.4458,
    0.4456,
    0.4454,
    0.4453,
    0.4451,
    0.4449,
    0.4448,
    0.4447,
    0.4447,
    0.4448,
    0.4451,
    0.4453,
    0.4455,
    0.4458,
    0.4465,
    0.4475,
    0.4486,
    0.4499,
    0.4519,
    0.454,
    0.4632,
    0.4793,
    0.8804,
    0.8851,
    0.8914,
    0.8725,
    0.4295,
    0.4444,
    0.4591,
    0.4971,
    0.5138,
    0.5462,
    0.5741,
    0.61,
    0.6384,
    0.7026,
    0.7331,
    0.7735,
    0.7955,
    0.8124,
    0.824,
    0.8429,
    0.8658,
    0.8778,
    0.8954,
    0.9178,
    0.9288,
    0.9431,
    0.9575,
    0.9541,
    0.9541,
    0.9471,
    0.9393,
    0.9034,
    0.8772,
    0.8832,
    0.8617,
    0.8396,
    0.8266,
    0.8068,
    0.7704,
    0.7504,
    0.7193,
    0.7007,
    0.6806,
    0.665,
    0.6411,
    0.6282,
    0.6136,
    0.5947,
    0.5763,
    0.5636,
    0.5431,
    1.0,
    0.9836,
    0.9721,
    0.9612,
    0.9486,
    0.9375,
    0.9332,
    0.9265,
    0.9153,
    0.8986,
    0.8766,
    0.8719,
    0.8676
   ],
   "weekday": [
    0.8968,
    0.8908,
    0.8881,
    0.8859,
    0.8839,
    0.8822,
    0.8808,
    0.88,
    0.4662,
    0.4658,
    0.4656,
    0.4654,
    0.4652,
    0.465,
    0.4649,
    0.4647,
    0.4645,
    0.4644,
    0.4644,
    0.4646,
    0.4648,
    0.4651,
    0.4654,
    0.4657,
    0.4664,
    0.4674,
    0.4686,
    0.4701,
    0.4724,
    0.4747,
    0.4838,
    0.4738,
    0.6755,
    0.5998,
    0.5397,
    0.4686,
    0.4481,
    0.4637,
    0.4791,
    0.5187,
    0.5363,
    0.5703,
    0.5994,
    0.6371,
    0.6668,
    0.7338,
    0.7656,
    0.8078,
    0.8308,
    0.8485,
    0.8606,
    0.8803,
    0.9042,
    0.9167,
    0.9351,
    0.9585,
    0.97,
    0.985,
    1.0,
    0.9964,
    0.9964,
    0.9891,
    0.981,
    0.9435,
    0.9161,
    0.9224,
    0.8999,
    0.8768,
    0.8633,
    0.8426,
    0.8046,
    0.7837,
    0.7512,
    0.7318,
    0.7108,
    0.6945,
    0.6695,
    0.656,
    0.6408,
    0.621,
    0.6019,
    0.5886,
    0.5671,
    0.5753,
    0.5939,
    0.6268,
    0.6524,
    0.6872,
    0.7363,
    0.9674,
    0.9676,
    0.9559,
    0.9384,
    0.9155,
    0.9106,
    0.9061
   ],
   "url": "https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/comstock_amy2018_release_3/timeseries_aggregates/by_county/upgrade=0/county=G0600010/up0-g0600010-warehouse.csv",
   "county": "Alameda (06001)",
   "models": 295
  }
 },
 "ahj": {
  "Hayward": {
   "portal": "https://haywardca-energovpub.tylerhost.net/Apps/SelfService#/home",
   "portalName": "Hayward e-Permits (EnerGov)"
  },
  "San Jose": {
   "portal": "https://www.sjpermits.org/",
   "portalName": "SJPermits.org"
  },
  "Holliston": {
   "portal": "https://www.mapsonline.net/hollistonma/public_permit_reports.html.php",
   "portalName": "Holliston public permit reports",
   "note": "Permit no., status, category, project cost by address"
  }
 },
 "permitting": [
  {
   "name": "NYC DOB OTCR battery checklist",
   "url": "https://www.nyc.gov/assets/buildings/pdf/OTCR_battery_app_checklist.pdf"
  },
  {
   "name": "NYSERDA BESS model permit",
   "url": "https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/Clean-Energy-Siting/Battery-Energy-Storage-System-Model-Permit.pdf"
  }
 ]
};
