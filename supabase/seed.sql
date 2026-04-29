-- ============================================================================
-- Seed: department aliases
-- ============================================================================
-- Starter list mapping common abbreviations to canonical full names.
-- Add to this as your scrapers surface new variations.
-- The data-processing layer should also append discovered aliases here on the fly.
-- ============================================================================

insert into public.department_aliases (canonical_name, alias) values
    -- California Department of Technology (your example)
    ('California Department of Technology', 'California Department of Technology'),
    ('California Department of Technology', 'CA DoT'),
    ('California Department of Technology', 'CA DOT'),
    ('California Department of Technology', 'CDT'),
    ('California Department of Technology', 'Dept. of Technology'),
    ('California Department of Technology', 'Department of Technology'),
    ('California Department of Technology', 'CA Department of Technology'),

    -- California Department of Transportation (note: ALSO "CA DOT" in the wild — disambiguate by context)
    ('California Department of Transportation', 'California Department of Transportation'),
    ('California Department of Transportation', 'Caltrans'),
    ('California Department of Transportation', 'CALTRANS'),

    -- California Department of General Services
    ('California Department of General Services', 'California Department of General Services'),
    ('California Department of General Services', 'DGS'),
    ('California Department of General Services', 'CA DGS'),
    ('California Department of General Services', 'Dept. of General Services'),

    -- California Department of Motor Vehicles
    ('California Department of Motor Vehicles', 'California Department of Motor Vehicles'),
    ('California Department of Motor Vehicles', 'CA DMV'),
    ('California Department of Motor Vehicles', 'DMV'),

    -- California Department of Justice
    ('California Department of Justice', 'California Department of Justice'),
    ('California Department of Justice', 'CA DOJ'),
    ('California Department of Justice', 'CADOJ'),

    -- California Department of Public Health
    ('California Department of Public Health', 'California Department of Public Health'),
    ('California Department of Public Health', 'CDPH'),
    ('California Department of Public Health', 'CA DPH'),

    -- Federal examples (sam.gov surfaces these)
    ('United States Department of Defense', 'United States Department of Defense'),
    ('United States Department of Defense', 'DoD'),
    ('United States Department of Defense', 'DOD'),
    ('United States Department of Defense', 'Dept. of Defense'),

    ('United States Department of Homeland Security', 'United States Department of Homeland Security'),
    ('United States Department of Homeland Security', 'DHS'),
    ('United States Department of Homeland Security', 'Dept. of Homeland Security'),

    ('General Services Administration', 'General Services Administration'),
    ('General Services Administration', 'GSA'),

    ('Cybersecurity and Infrastructure Security Agency', 'Cybersecurity and Infrastructure Security Agency'),
    ('Cybersecurity and Infrastructure Security Agency', 'CISA')
on conflict (alias) do nothing;
