-- Existing banners table extension for targeted business-detail advertising
alter table public.banners add column if not exists display_type text not null default 'banner';
alter table public.banners add column if not exists placement text not null default 'home';
alter table public.banners add column if not exists description text;
alter table public.banners add column if not exists button_label text not null default '자세히 보기';
alter table public.banners add column if not exists start_at timestamptz;
alter table public.banners add column if not exists end_at timestamptz;

-- Existing business-linked banners can be reused on both home and detail pages.
update public.banners set placement='both' where business_id is not null and (placement is null or placement='home');
