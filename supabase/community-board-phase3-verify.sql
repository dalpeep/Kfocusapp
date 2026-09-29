-- Read-only checks after running community-board-phase3.sql in the intended project.
select
  to_regclass('public.community_posts') is not null as posts_exists,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='community_posts' and column_name='details' and data_type='jsonb') as details_jsonb_exists,
  to_regprocedure('public.community_list_public_v3(text,text,text,integer,integer)') is not null as list_v3_exists,
  to_regprocedure('public.community_get_public_v3(uuid)') is not null as detail_v3_exists,
  to_regprocedure('public.community_comments_public_v3(uuid)') is not null as comments_v3_exists,
  to_regprocedure('public.community_apply_post_details_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)') is not null as edit_rpc_exists,
  has_function_privilege('anon','public.community_list_public_v3(text,text,text,integer,integer)','EXECUTE') as anon_can_list,
  has_function_privilege('anon','public.community_get_public_v3(uuid)','EXECUTE') as anon_can_read_detail,
  not has_table_privilege('anon','public.community_posts','SELECT') as anon_cannot_select_posts,
  not has_function_privilege('anon','public.community_apply_post_details_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)','EXECUTE') as anon_cannot_edit_rpc,
  has_function_privilege('service_role','public.community_apply_post_details_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)','EXECUTE') as service_role_can_edit_rpc;
