"""Department alias map.

Mirrors `supabase/seed.sql` so the processor can run without a database
round-trip, with extras for variants observed in scraper output (e.g. the
truncated "Ofc Technology and Solutions I" string from Cal eProcure).

Keys are aliases (case-insensitive when looked up); values are canonical
full names with no abbreviations.
"""

DEPARTMENT_ALIASES: dict[str, str] = {
    # California Department of Technology
    "California Department of Technology": "California Department of Technology",
    "Dept. of Technology": "California Department of Technology",
    "Department of Technology": "California Department of Technology",
    "CA Department of Technology": "California Department of Technology",
    "CDT": "California Department of Technology",

    # California Department of Transportation
    "California Department of Transportation": "California Department of Transportation",
    "Caltrans": "California Department of Transportation",
    "CALTRANS": "California Department of Transportation",
    "CA DOT": "California Department of Transportation",

    # California Department of General Services
    "California Department of General Services": "California Department of General Services",
    "DGS": "California Department of General Services",
    "CA DGS": "California Department of General Services",
    "Dept. of General Services": "California Department of General Services",

    # California Department of Motor Vehicles
    "California Department of Motor Vehicles": "California Department of Motor Vehicles",
    "CA DMV": "California Department of Motor Vehicles",
    "DMV": "California Department of Motor Vehicles",

    # California Department of Justice
    "California Department of Justice": "California Department of Justice",
    "CA DOJ": "California Department of Justice",
    "CADOJ": "California Department of Justice",

    # California Department of Public Health
    "California Department of Public Health": "California Department of Public Health",
    "CDPH": "California Department of Public Health",
    "CA DPH": "California Department of Public Health",

    # California Department of Forestry and Fire Protection
    "California Department of Forestry and Fire Protection (CAL FIRE)":
        "California Department of Forestry and Fire Protection (CAL FIRE)",
    "California Department of Forestry and Fire Protection":
        "California Department of Forestry and Fire Protection (CAL FIRE)",
    "CAL FIRE": "California Department of Forestry and Fire Protection (CAL FIRE)",
    "CalFire": "California Department of Forestry and Fire Protection (CAL FIRE)",
    "Cal Fire": "California Department of Forestry and Fire Protection (CAL FIRE)",
    "CA Dept of Forestry and Fire Protection":
        "California Department of Forestry and Fire Protection (CAL FIRE)",

    # California Department of Developmental Services
    "California Department of Developmental Services": "California Department of Developmental Services",
    "Department of Developmental Services": "California Department of Developmental Services",
    "DDS": "California Department of Developmental Services",
    "CA DDS": "California Department of Developmental Services",

    # California Department of Health Care Services
    "California Department of Health Care Services": "California Department of Health Care Services",
    "Department of Health Care Services": "California Department of Health Care Services",
    "DHCS": "California Department of Health Care Services",
    "CA DHCS": "California Department of Health Care Services",

    # Office of Technology and Solutions Integration (CalHEERS owner)
    "Office of Technology and Solutions Integration (OTSI)":
        "Office of Technology and Solutions Integration (OTSI)",
    "Office of Technology and Solutions Integration":
        "Office of Technology and Solutions Integration (OTSI)",
    "OTSI": "Office of Technology and Solutions Integration (OTSI)",
    # Truncated form observed in raw Cal eProcure scrapes (last word cut off):
    "Ofc Technology and Solutions I": "Office of Technology and Solutions Integration (OTSI)",
    "Ofc Technology and Solutions Integration": "Office of Technology and Solutions Integration (OTSI)",
    "Office of Tech and Solutions Integration": "Office of Technology and Solutions Integration (OTSI)",

    # Federal
    "United States Department of Defense": "United States Department of Defense",
    "DoD": "United States Department of Defense",
    "DOD": "United States Department of Defense",
    "Dept. of Defense": "United States Department of Defense",

    "United States Department of Homeland Security": "United States Department of Homeland Security",
    "DHS": "United States Department of Homeland Security",
    "Dept. of Homeland Security": "United States Department of Homeland Security",

    "General Services Administration": "General Services Administration",
    "GSA": "General Services Administration",

    "Cybersecurity and Infrastructure Security Agency":
        "Cybersecurity and Infrastructure Security Agency",
    "CISA": "Cybersecurity and Infrastructure Security Agency",
}


ABBREVIATION_EXPANSIONS: dict[str, str] = {
    # Word-level expansions applied as a last-resort to unrecognized strings.
    "Ofc": "Office of",
    "Ofc.": "Office of",
    "Dept": "Department",
    "Dept.": "Department",
    "Mgmt": "Management",
    "Mgmt.": "Management",
    "Admin": "Administration",
    "Admin.": "Administration",
    "Svcs": "Services",
    "Svcs.": "Services",
    "Srvcs": "Services",
    "Srvcs.": "Services",
    "Comm": "Commission",
    "Comm.": "Commission",
    "Ofcs": "Offices",
    "Bldg": "Building",
    "Bldg.": "Building",
    "Tech": "Technology",
    "Tech.": "Technology",
    "Info": "Information",
    "Info.": "Information",
}
