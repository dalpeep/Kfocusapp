-- Isolated staging/test fixture only. Never apply to Production.
-- Replace :business_a ... :business_h with synthetic staging business bigint IDs.
insert into public.business_specials
  (business_id,type,title,description,price_text,days_of_week,start_time,end_time,start_date,end_date,is_active,sort_order)
values
  (:business_a,'lunch_special','A 점심특선','Synthetic fixture','$14.99','{1,2,3,4,5}','11:00','14:30',current_date,current_date+90,true,10),
  (:business_b,'happy_hour','B Happy Hour','Synthetic fixture','Selected items','{1,2,3,4}','16:00','19:00',current_date,current_date+90,true,10),
  (:business_c,'lunch_special','C 점심특선','Synthetic fixture','$12.99','{1,2,3,4,5}','11:00','14:30',current_date,current_date+90,true,10),
  (:business_c,'happy_hour','C Happy Hour','Synthetic fixture','Drinks & appetizers','{1,2,3,4}','16:00','19:00',current_date,current_date+90,true,20),
  (:business_d,'lunch_special','D 비활성','Synthetic fixture','$10','{1,2,3,4,5}','11:00','14:00',current_date,current_date+90,false,10),
  (:business_e,'lunch_special','E 종료','Synthetic fixture','$10','{1,2,3,4,5}','11:00','14:00',current_date-30,current_date-1,true,10),
  (:business_f,'happy_hour','F 예정','Synthetic fixture','Coming soon','{1,2,3,4}','16:00','19:00',current_date+30,current_date+90,true,10),
  (:business_g,'happy_hour','G Overnight','Synthetic fixture','Late night','{1,2,3,4,5}','22:00','01:00',current_date,current_date+90,true,10),
  (:business_h,'lunch_special','H 첫 특선','Synthetic fixture','$11','{1,2,3,4,5}','11:00','14:00',current_date,current_date+90,true,10),
  (:business_h,'lunch_special','H 둘째 특선','Synthetic fixture','$13','{1,2,3,4,5}','11:30','14:30',current_date,current_date+90,true,20);
