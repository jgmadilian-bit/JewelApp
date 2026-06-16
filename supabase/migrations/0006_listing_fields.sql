-- ===========================================================================
-- 0006_listing_fields.sql — generalize listings beyond loose diamonds.
-- Real group posts are mostly finished jewelry (rings, bracelets, chains,
-- semi-mounts) described in a free-text caption. We store the raw caption plus
-- structured fields parsed from it. Existing stone_* columns now hold the
-- primary/center stone.
-- ===========================================================================

alter table public.listings
  add column if not exists description  text,            -- the raw caption as posted
  add column if not exists category     text,            -- Ring, Bracelet, Necklace, Chain, Earrings, Pendant, Brooch, Semi-mount, Loose stone, Watch, ...
  add column if not exists metal        text,            -- e.g. "18K Yellow Gold", "Platinum"
  add column if not exists gross_weight numeric(8, 2),   -- weight value
  add column if not exists weight_unit  text,            -- 'g' or 'dwt'
  add column if not exists ring_size    text,            -- "6", "6.5"
  add column if not exists item_length  text,            -- "22.75\"", "7\""
  add column if not exists condition    text,            -- "chipped in a few places"
  add column if not exists era          text,            -- Antique, Mid-century, Art Deco, Old Miner, ...
  add column if not exists total_carat  numeric(7, 2),   -- total diamond/gem ctw on the piece
  add column if not exists price_terms  text,            -- "plus label · 10% over", "shipped"
  add column if not exists gemstones    jsonb;           -- [{type,carat,ctw,each,color,clarity,shape,count}]

alter table public.listings drop constraint if exists listings_weight_unit_check;
alter table public.listings
  add constraint listings_weight_unit_check
  check (weight_unit is null or weight_unit in ('g', 'dwt')) not valid;
