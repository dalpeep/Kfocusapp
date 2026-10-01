-- Isolated PostgreSQL only; every synthetic row is rolled back.
begin;
do $$
declare
  market_id uuid;
  housing_id uuid;
  old_housing_id uuid;
  n integer;
  due timestamptz;
begin
  insert into public.community_posts(area,category,title,body,author_name,password_hash,status,expires_at,cleanup_after)
  values('dallas','marketplace','Synthetic marketplace','Isolated test','Tester','test-hash','approved',now()+interval '30 days',now()+interval '37 days')
  returning id into market_id;
  insert into public.community_posts(area,category,title,body,author_name,password_hash,status,expires_at,cleanup_after)
  values('dallas','housing','Synthetic housing','Isolated test','Tester','test-hash','approved',now()+interval '90 days',now()+interval '97 days')
  returning id into housing_id;
  insert into public.community_posts(area,category,title,body,author_name,password_hash,status)
  values('dallas','housing','Legacy housing','Isolated test','Tester','test-hash','approved')
  returning id into old_housing_id;

  select count(*) into n from public.community_list_public_v4('dallas',null,null,0,100)
    where id in (market_id,housing_id,old_housing_id);
  if n<>3 then raise exception 'Initial or legacy public list mismatch: %',n; end if;

  update public.community_posts set expires_at=expires_at+interval '30 days',
    cleanup_after=cleanup_after+interval '30 days',extension_count=1 where id=market_id;
  update public.community_posts set expires_at=expires_at+interval '90 days',
    cleanup_after=cleanup_after+interval '90 days',extension_count=1 where id=housing_id;
  select expires_at into due from public.community_posts where id=housing_id and status='approved' and extension_count=1;
  if due is null then raise exception 'Housing approval or extension lost'; end if;

  insert into public.community_post_images(post_id,storage_path,image_url,width,height,byte_size)
  values(housing_id,'community-posts/synthetic/photo.webp','https://example.invalid/photo.webp',200,200,1000);
  update public.community_posts set status='expired' where id=housing_id;
  select count(*) into n from public.community_get_public_v4(housing_id);
  if n<>0 then raise exception 'Expired housing detail is public'; end if;
  select count(*) into n from public.community_list_public_v4('dallas','housing',null,0,100) where id=housing_id;
  if n<>0 then raise exception 'Expired housing list is public'; end if;
  select count(*) into n from public.community_post_images where post_id=housing_id;
  if n<>1 then raise exception 'Expired housing image reference was lost'; end if;
  select count(*) into n from public.community_posts where id=housing_id and status='expired';
  if n<>1 then raise exception 'Expired housing row was lost'; end if;

  update public.community_posts set expires_at=now()-interval '1 minute' where id=market_id;
  select count(*) into n from public.community_get_public_v4(market_id);
  if n<>0 then raise exception 'Expired marketplace detail is public before sweep'; end if;
  select count(*) into n from public.community_list_public_v4('dallas','marketplace',null,0,100) where id=market_id;
  if n<>0 then raise exception 'Expired marketplace list is public before sweep'; end if;

  select count(*) into n from public.community_get_public_v4(old_housing_id);
  if n<>1 then raise exception 'Legacy housing compatibility failed'; end if;
end $$;
rollback;
