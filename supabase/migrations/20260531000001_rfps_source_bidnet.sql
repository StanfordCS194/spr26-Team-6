-- ----------------------------------------------------------------------------
-- Allow "BidNet Direct" as an rfps.source value.
-- The BidNet Direct scraper (scraper/bidnet_interface.py) ingests California
-- Purchasing Group "Groups" bids with the canonical source label "BidNet Direct"
-- (see processor/normalize.py _SOURCE_CANON). Extend the source check constraint
-- so those rows pass; mirrors 20260428000008_full_schema.sql.
-- ----------------------------------------------------------------------------
alter table public.rfps drop constraint if exists rfps_source_check;
alter table public.rfps add constraint rfps_source_check
    check (source in ('sam.gov', 'Cal eProcure', 'PlanetBids', 'BidNet Direct', 'other'));
