-- Extend rfps.source check for multi-source ingest (Approach B / eng review T6).
-- Supply.io intentionally omitted — spike NO-GO until Anvaya confirms product URL.

alter table public.rfps drop constraint if exists rfps_source_check;

alter table public.rfps add constraint rfps_source_check
    check (source in (
        'sam.gov',
        'Cal eProcure',
        'PlanetBids',
        'Authorium',
        'Public Purchase',
        'other'
    ));
