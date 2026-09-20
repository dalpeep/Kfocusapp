-- Isolated staging/test fixture only. Never apply to Production.
-- Uses only the synthetic businesses already present in the isolated staging project.
with synthetic_businesses as (
  select id,row_number() over(order by id) as fixture_no
  from public.businesses
  where coalesce(name_ko,name_en,name,'') like 'Staging Business%'
  order by id
  limit 1508
)
insert into public.business_specials
  (business_id,type,title,description,price_text,days_of_week,start_time,end_time,
   start_date,end_date,image_url,is_active,sort_order)
select id,
  case when fixture_no % 2=0 then 'happy_hour' else 'lunch_special' end,
  'Synthetic Special '||fixture_no,
  'Restaurant Specials isolated staging fixture',
  case when fixture_no % 2=0 then 'Selected items' else '$14.99' end,
  case when fixture_no % 7=0 then '{0,1,2,3,4,5,6}'::smallint[] else '{1,2,3,4,5}'::smallint[] end,
  case when fixture_no % 2=0 then '16:00'::time else '11:00'::time end,
  case when fixture_no % 29=0 then '01:00'::time
       when fixture_no % 2=0 then '19:00'::time else '14:30'::time end,
  current_date-1,current_date+90,
  case when fixture_no=1 then 'https://placehold.co/640x360/png?text=Staging+Special' end,
  true,fixture_no::integer
from synthetic_businesses;

-- Explicit edge cases and multiple records for the first synthetic business.
with first_business as (
  select id from public.businesses
  where coalesce(name_ko,name_en,name,'') like 'Staging Business%'
  order by id limit 1
)
insert into public.business_specials
  (business_id,type,title,description,price_text,days_of_week,start_time,end_time,
   start_date,end_date,is_active,sort_order)
select id,v.type,v.title,'Restaurant Specials isolated staging fixture',v.price_text,
       v.days_of_week,v.start_time,v.end_time,v.start_date,v.end_date,v.is_active,v.sort_order
from first_business
cross join lateral (values
  ('happy_hour','Synthetic Overnight Happy Hour','Late night','{0,1,2,3,4,5,6}'::smallint[],'22:00'::time,'01:00'::time,current_date-1,current_date+90,true,2001),
  ('lunch_special','Synthetic Disabled Lunch','$10','{1,2,3,4,5}'::smallint[],'11:00'::time,'14:00'::time,current_date-1,current_date+90,false,2002),
  ('lunch_special','Synthetic Expired Lunch','$10','{1,2,3,4,5}'::smallint[],'11:00'::time,'14:00'::time,current_date-30,current_date-1,true,2003),
  ('happy_hour','Synthetic Future Happy Hour','Coming soon','{1,2,3,4,5}'::smallint[],'16:00'::time,'19:00'::time,current_date+30,current_date+90,true,2004)
) as v(type,title,price_text,days_of_week,start_time,end_time,start_date,end_date,is_active,sort_order);
