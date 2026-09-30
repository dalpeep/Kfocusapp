-- Run only against the isolated local PostgreSQL container after all baseline
-- Community migrations and community-board-phase3.sql. Transaction rolls back.
begin;

do $$
declare
  categories text[]:=array['job_hiring','job_seeking','marketplace','neighborhood','qna'];
  payloads jsonb[]:=array[
    '{"business_name":"Local cafe","occupation":"Server","employment_type":"part_time","pay":"$20","work_area":"Dallas"}'::jsonb,
    '{"occupation":"Designer","experience":"2 years","preferred_area":"Plano","employment_type":"contract"}'::jsonb,
    '{"listing_type":"sell","item_name":"Desk","price":"$50","negotiable":true,"item_condition":"used","trade_area":"Carrollton"}'::jsonb,
    '{"news_type":"event","event_date":"2026-10-01","venue":"Library"}'::jsonb,
    '{"post_type":"question","topic":"School","resolved":false}'::jsonb
  ];
  ids uuid[]:='{}'::uuid[];
  current_id uuid;
  edit_id uuid;
  outcome jsonb;
  n integer;
  i integer;
begin
  for i in 1..5 loop
    insert into public.community_posts(region,area,category,title,body,author_name,contact_type,contact_value,password_hash,status,details,expires_at,cleanup_after)
    values('dallas','dallas',categories[i],'Phase 3 local '||i,'Local isolated test body','Local test author','email','local@example.invalid','test-hash','pending',payloads[i],
      case when categories[i]='marketplace' then now()+interval '30 days' else null end,
      case when categories[i]='marketplace' then now()+interval '37 days' else null end)
    returning id into current_id;
    ids:=array_append(ids,current_id);
    select count(*) into n from public.community_list_public_v3('dallas',categories[i],null,0,100) where id=current_id;
    if n<>0 then raise exception 'Pending post leaked for category %',categories[i]; end if;
    update public.community_posts set status='approved',approved_at=now() where id=current_id;
    select count(*) into n from public.community_list_public_v3('dallas',categories[i],null,0,100)
      where id=current_id and details=payloads[i] and status='approved';
    if n<>1 then raise exception 'List/approval mismatch for category %',categories[i]; end if;
    select count(*) into n from public.community_get_public_v3(current_id)
      where details=payloads[i] and status='approved';
    if n<>1 then raise exception 'Detail mismatch for category %',categories[i]; end if;
    edit_id:=gen_random_uuid();
    outcome:=public.community_apply_post_details_image_edit(
      edit_id,current_id,
      jsonb_build_object('region','dallas','area','dallas','category',categories[i],
        'title','Phase 3 edited '||i,'body','Edited local body','author_name','Local test author',
        'contact_type',null,'contact_value',null,'video_url',null,'video_provider',null,'details',payloads[i]),
      '[]'::jsonb,gen_random_uuid(),repeat('a',64));
    if outcome->>'status'<>'pending' then raise exception 'Edit RPC did not mark pending for category %',categories[i]; end if;
    select count(*) into n from public.community_get_public_v3(current_id);
    if n<>0 then raise exception 'Edited pending post leaked for category %',categories[i]; end if;
    select count(*) into n from public.community_posts where id=current_id and title='Phase 3 edited '||i and details=payloads[i];
    if n<>1 then raise exception 'Edit RPC did not persist details for category %',categories[i]; end if;
    update public.community_posts set status='approved',approved_at=now() where id=current_id;
  end loop;

  update public.community_posts set status='sold',sold_at=now() where id=ids[3];
  select count(*) into n from public.community_list_public_v3('dallas','marketplace',null,0,100)
    where id=ids[3] and status='sold';
  if n<>1 then raise exception 'Sold card status missing'; end if;
  select count(*) into n from public.community_get_public_v3(ids[3])
    where status='sold' and contact_type is null and contact_value is null;
  if n<>1 then raise exception 'Sold detail exposed contact information'; end if;

  for i in 1..5 loop
    update public.community_posts set status='deleted',cleanup_after=now()+interval '7 days' where id=ids[i];
    select count(*) into n from public.community_get_public_v3(ids[i]);
    if n<>0 then raise exception 'Deleted post remained public for category %',categories[i]; end if;
  end loop;
end $$;

rollback;
