-- Production read-only verification. Run after the migration in project
-- ydrxuqmjzayejlnjzzew only. Does not return Community user rows.
with expected_functions(signature) as (
  values
    ('public.community_video_claim_admission(uuid,text,text)'),
    ('public.community_video_claim_processing(uuid,text,text,bigint)'),
    ('public.community_video_fail_admission(uuid,text)'),
    ('public.community_video_finish_dry_run(uuid,text,uuid,text)'),
    ('public.community_video_finish_upload(uuid,text,uuid,text,text,text)')
), functions as (
  select signature, to_regprocedure(signature) as oid
  from expected_functions
)
select
  current_database() as database_name,
  current_user as database_user,
  to_regclass('public.community_video_upload_jobs') is not null as jobs_exists,
  (select count(*) from public.community_video_upload_jobs) as initial_job_count,
  (select c.relrowsecurity from pg_catalog.pg_class c
   where c.oid = 'public.community_video_upload_jobs'::regclass) as jobs_rls_enabled,
  to_regclass('public.community_video_one_active_job_per_post') is not null
    as active_job_index_exists,
  to_regclass('public.community_video_jobs_cleanup_idx') is not null
    as cleanup_index_exists,
  (select count(*) = 5 from functions where oid is not null) as five_rpcs_exist,
  (select coalesce(bool_and(p.prosecdef),false) from functions f
   join pg_catalog.pg_proc p on p.oid = f.oid) as all_rpcs_security_definer,
  (select coalesce(bool_and(has_function_privilege('anon',oid,'EXECUTE')),false)
   from functions) as anon_can_execute_five_rpcs,
  (select coalesce(bool_and(not has_function_privilege('authenticated',oid,'EXECUTE')),false)
   from functions) as authenticated_cannot_execute_five_rpcs,
  has_table_privilege('service_role','public.community_video_upload_jobs','SELECT')
    as service_role_can_select_jobs,
  has_table_privilege('service_role','public.community_video_upload_jobs','INSERT')
    as service_role_can_insert_jobs,
  has_table_privilege('service_role','public.community_video_upload_jobs','UPDATE')
    as service_role_can_update_jobs,
  not has_table_privilege('anon','public.community_video_upload_jobs','SELECT')
    as anon_cannot_select_jobs,
  not has_table_privilege('authenticated','public.community_video_upload_jobs','SELECT')
    as authenticated_cannot_select_jobs,
  (select pg_get_constraintdef(oid) like '%production/%'
   from pg_catalog.pg_constraint
   where conrelid = 'public.community_video_upload_jobs'::regclass
     and conname = 'community_video_job_object_key_check')
    as production_object_prefix_check;
