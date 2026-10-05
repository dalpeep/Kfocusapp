-- PREPARED ONLY. Correct only Test state ref and its CHECK; no reset or Storage changes.
-- Actual owner-test Project ID: aaikttogoejfvxbosktg.
begin;
do $$
declare platform_ref text; c_name text; c_expr text; n integer;
begin
  if current_user <> 'postgres' then raise exception 'postgres role required'; end if;
  platform_ref := nullif(current_setting('supabase.project_ref',true),'');
  if platform_ref='ydrxuqmjzayejlnjzzew'
    or (platform_ref is not null and platform_ref<>'aaikttogoejfvxbosktg') then
    raise exception 'Wrong/Production platform ref';
  end if;
  lock table public.owner_test_preview_state,public.owner_test_project_marker,
    public.owner_test_preview_manifest,public.businesses,public.posts,
    public.business_requests,public.business_specials,public.business_special_items
    in access exclusive mode;
  if (select count(*) from public.owner_test_project_marker)<>1
    or not exists(select 1 from public.owner_test_project_marker where id=true) then
    raise exception 'Original Test marker required';
  end if;
  if (select count(*) from public.owner_test_preview_state)<>1
    or not exists(select 1 from public.owner_test_preview_state where id=true
      and project_ref='aaikttgoejfvxbosktgg' and phase='reset' and storage_ready=false) then
    raise exception 'Exact reviewed source ref/reset/not-ready state required';
  end if;
  if to_regclass('public.coupons') is not null
    or to_regclass('public.community_posts') is not null
    or exists(select 1 from public.businesses) or exists(select 1 from public.posts)
    or exists(select 1 from public.business_requests)
    or exists(select 1 from public.business_specials)
    or exists(select 1 from public.business_special_items)
    or (select count(*) from storage.objects)<>3
    or (select count(*) from storage.buckets)<>7
    or not exists(select 1 from storage.buckets where id='community-images' and public=false)
    or (select count(*) from public.owner_test_preview_manifest)<>70
    or (select count(*) from public.owner_test_preview_manifest where action='delete_fixture')<>63
    or (select count(*) from public.owner_test_preview_manifest where action='storage_api_remove')<>3
    or (select count(*) from public.owner_test_preview_manifest where action='preserve_auth')<>4
    or (select count(*) from auth.users)<>4
    or (select count(distinct email) from auth.users)<>4
    or exists(select 1 from auth.users where email is null or email not in
      ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid'))
    or exists(select 1 from storage.objects where bucket_id<>'public-images' or name not in
      ('migration-a/after-protected-1791089841006.txt',
       'migration-a/after-protected-1791091355756.txt',
       'migration-a/after-protected-1791091543255.txt')) then
    raise exception 'Reviewed post-08 Test baseline required; no modification';
  end if;
  select count(*) into n from pg_constraint c join pg_attribute a
    on a.attrelid=c.conrelid and a.attname='project_ref' and not a.attisdropped
    where c.conrelid='public.owner_test_preview_state'::regclass
      and c.contype='c' and a.attnum=any(c.conkey);
  if n<>1 then raise exception 'Exactly one ref CHECK required'; end if;
  select c.conname,pg_get_expr(c.conbin,c.conrelid) into strict c_name,c_expr
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid
      and a.attname='project_ref' and not a.attisdropped
    where c.conrelid='public.owner_test_preview_state'::regclass and c.contype='c'
      and c.conkey=array[a.attnum]::smallint[] and c.convalidated and not c.connoinherit;
  if regexp_replace(c_expr,'[[:space:]()]','','g')
    <> 'project_ref='''||'aaikttgoejfvxbosktgg'||'''::text' then
    raise exception 'Exact reviewed source CHECK required';
  end if;
  execute format('alter table public.owner_test_preview_state drop constraint %I',c_name);
  update public.owner_test_preview_state set project_ref='aaikttogoejfvxbosktg'
    where id=true and project_ref='aaikttgoejfvxbosktgg';
  execute format('alter table public.owner_test_preview_state add constraint %I check (project_ref=%L::text)',
    c_name,'aaikttogoejfvxbosktg');
end $$;
commit;
