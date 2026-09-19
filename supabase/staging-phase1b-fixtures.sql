begin;

-- Synthetic businesses only. Names, contacts and coordinates are fabricated.
insert into public.businesses (
  id,name_ko,name_en,category_ko,map_category,address,lat,lng,region,is_active,list_visible,
  is_featured,featured_rank,is_new,new_rank,is_popular,popular_rank,
  paid_product,paid_active,paid_start_at,paid_end_at,paid_weight,created_at
)
select
  'stage-biz-'||lpad(g::text,4,'0'),
  'Staging Business '||g,
  'Staging Business '||g,
  case when g%3=0 then 'restaurant' when g%3=1 then 'lifestyle' else 'professional-services' end,
  case when g%3=0 then 'restaurant' when g%3=1 then 'lifestyle' else 'services' end,
  (1000+g)::text||' Fixture Ave, Test City, TX',
  32.7767 + (g%30)*0.001,
  -96.7970 + (g%30)*0.001,
  'dallas',true,true,
  g<=20,g,
  g<=20,g,
  g<=20,g,
  case when g<=4 then 'featured' else 'none' end,
  g<=4,
  case when g<=4 then now()-interval '1 day' end,
  case when g<=4 then now()+interval '30 days' end,
  case when g<=4 then 20-g else 1 end,
  case
    when g=7 then now()-interval '167 hours 59 minutes'
    when g=8 then now()-interval '168 hours'
    when g=9 then now()-interval '168 hours 1 minute'
    else now()-(g%20)*interval '12 hours'
  end
from generate_series(1,1507) g
on conflict(id) do nothing;

-- Explicit inactive/hidden/future/expired paid boundaries.
update public.businesses set is_active=false where id='stage-biz-1504';
update public.businesses set list_visible=false where id='stage-biz-1505';
update public.businesses set paid_product='featured',paid_active=true,paid_start_at=now()+interval '1 day',paid_end_at=now()+interval '30 days' where id='stage-biz-1506';
update public.businesses set paid_product='featured',paid_active=true,paid_start_at=now()-interval '30 days',paid_end_at=now()-interval '1 second' where id='stage-biz-1507';

-- A duplicate identity fixture with a distinct id.
insert into public.businesses(id,name_ko,name_en,map_category,address,lat,lng,region,is_active,list_visible,created_at)
values('stage-biz-duplicate','Staging Business 10','Staging Business 10','restaurant','1010 Fixture Ave, Test City, TX',32.7867,-96.7870,'dallas',true,true,now())
on conflict(id) do nothing;

insert into public.newsroom_settings(region,home_config)
values('dallas',jsonb_build_object(
  'business_mode','direct',
  'business_ids',jsonb_build_array('stage-biz-0006','stage-biz-0005','stage-biz-0004','stage-biz-0003','stage-biz-0002','stage-biz-0001','stage-biz-0007')
)) on conflict(region) do update set home_config=excluded.home_config,updated_at=now();

insert into public.business_activity(business_id,action_type,source,region,created_at)
select 'stage-biz-'||lpad(((g%12)+1)::text,4,'0'),'business_click','staging-fixture','dallas',now()-(g%120)*interval '1 minute'
from generate_series(1,1507) g;

insert into public.coupons(id,business_id,title,start_at,end_at,is_active,is_published) values
('stage-coupon-active-1','stage-biz-0001','Active coupon 1',(current_date-1)::text,(current_date+1)::text,true,true),
('stage-coupon-active-2','stage-biz-0001','Active coupon 2',current_date::text,current_date::text,true,true),
('stage-coupon-future','stage-biz-0002','Future coupon',(current_date+1)::text,(current_date+2)::text,true,true),
('stage-coupon-expired','stage-biz-0003','Expired coupon',(current_date-2)::text,(current_date-1)::text,true,true),
('stage-coupon-disabled','stage-biz-0004','Disabled coupon',current_date::text,(current_date+1)::text,false,true),
('stage-coupon-invalid','stage-biz-0005','Invalid coupon','not-a-date','also-not-a-date',true,true)
on conflict(id) do nothing;

insert into public.posts(id,business_id,title,type,subtype,event_start_at,event_end_at,is_active,is_published) values
('stage-event-active','stage-biz-0001','Active event','event','event',current_date::text,current_date::text,true,true),
('stage-event-timestamp','stage-biz-0002','Timestamp event','event','event',(now()-interval '1 minute')::text,(now()+interval '1 minute')::text,true,true),
('stage-event-expired','stage-biz-0003','Expired event','event','event',(current_date-2)::text,(current_date-1)::text,true,true)
on conflict(id) do nothing;

insert into public.banners(id,business_id,title,discount_label,start_at,end_at,is_active,is_published) values
('stage-benefit-active','stage-biz-0001','Active benefit','10% OFF',current_date::text,current_date::text,true,true),
('stage-benefit-future','stage-biz-0002','Future benefit','20% OFF',(current_date+1)::text,(current_date+2)::text,true,true)
on conflict(id) do nothing;

insert into public.dalpick(id,business_id,category,title,start_at,end_at,is_active,is_published) values
('stage-dalpick-event','stage-biz-0003','event','DalPick event',current_date::text,current_date::text,true,true),
('stage-dalpick-promotion','stage-biz-0004','promotion','DalPick promotion',current_date::text,(current_date+1)::text,true,true)
on conflict(id) do nothing;

insert into public.slides(id,business_id,promo_enabled,promo_text,promo_start_at,promo_end_at,region) values
('stage-slide-active','stage-biz-0001',true,'Active staging slide',current_date::text,current_date::text,'dallas')
on conflict(id) do nothing;

-- Daily Core read-path fixtures. No OpenAI call is required for complete rows.
insert into public.newsroom_items(id,original_title,original_summary,original_url,source_name,duplicate_key,event_data,status,region) values
('stage-core-weather-complete','Fixture weather','Synthetic weather only','https://staging.invalid/weather-complete','staging','daily-core-weather-complete',jsonb_build_object('daily_core',true,'category','weather','date_key',current_date::text),'published','staging-complete'),
('stage-core-traffic-complete','Fixture traffic','Synthetic traffic only','https://staging.invalid/traffic-complete','staging','daily-core-traffic-complete',jsonb_build_object('daily_core',true,'category','traffic','date_key',current_date::text),'published','staging-complete'),
('stage-core-weather-only','Fixture weather','Synthetic weather only','https://staging.invalid/weather-only','staging','daily-core-weather-only',jsonb_build_object('daily_core',true,'category','weather','date_key',current_date::text),'published','staging-weather-only'),
('stage-core-traffic-only','Fixture traffic','Synthetic traffic only','https://staging.invalid/traffic-only','staging','daily-core-traffic-only',jsonb_build_object('daily_core',true,'category','traffic','date_key',current_date::text),'published','staging-traffic-only'),
('stage-normal-item','Normal fixture','Not Daily Core','https://staging.invalid/normal','staging','normal-fixture',jsonb_build_object('daily_core',false),'published','dallas')
on conflict(id) do nothing;

commit;

-- Lock fixtures use isolated regions and must never overlap smoke-test regions.
insert into public.daily_core_generation_locks(region,date_key,lock_token,expires_at)
values
('staging-lock-live',current_date,gen_random_uuid(),now()+interval '10 minutes'),
('staging-lock-expired',current_date,gen_random_uuid(),now()-interval '10 minutes')
on conflict(region,date_key) do update set lock_token=excluded.lock_token,expires_at=excluded.expires_at,updated_at=now();
