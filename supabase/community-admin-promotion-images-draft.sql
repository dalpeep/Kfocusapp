-- Review-only migration. Apply to Dallas only after explicit approval.
begin;

create function public.community_admin_save_promotion_images(
  p_post uuid, p_region text, p_version timestamptz, p_fields jsonb,
  p_plan jsonb, p_draft uuid, p_fingerprint text, p_request uuid, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  post public.community_posts%rowtype;
  previous public.community_image_edit_requests%rowtype;
  upload public.community_upload_drafts%rowtype;
  item jsonb;
  item_id uuid;
  ordinal integer := 0;
  retained uuid[] := '{}'::uuid[];
  seen uuid[] := '{}'::uuid[];
  result jsonb;
begin
  if p_request is null or p_actor is null or p_draft is null or p_fingerprint is null
      or jsonb_typeof(p_plan) is distinct from 'array' or jsonb_array_length(p_plan) > 3 then
    raise exception 'Invalid promotion image request' using errcode = '22023';
  end if;

  select * into post from public.community_posts where id = p_post and region = p_region for update;
  if not found then raise exception 'Post not found' using errcode = 'P0002'; end if;
  select * into previous from public.community_image_edit_requests where request_id = p_request;
  if found then
    if previous.post_id is distinct from p_post or previous.result->>'actor' is distinct from p_actor::text then
      raise exception 'Request identity conflict' using errcode = '22023';
    end if;
    return previous.result;
  end if;
  if post.category <> 'business_promotion' or post.status = 'deleted'
      or post.updated_at is distinct from p_version then
    raise exception 'Promotion has changed' using errcode = '40001';
  end if;

  for item in select value from jsonb_array_elements(p_plan) loop
    item_id := (item->>'id')::uuid;
    if item_id is null or item_id = any(seen) then
      raise exception 'Invalid or duplicate image' using errcode = '22023';
    end if;
    seen := array_append(seen,item_id);
    case item->>'kind'
      when 'existing' then
        perform 1 from public.community_post_images where id = item_id and post_id = p_post;
        if not found then raise exception 'Image does not belong to post' using errcode = '22023'; end if;
        retained := array_append(retained,item_id);
      when 'upload' then
        select * into upload from public.community_upload_drafts where id = item_id for update;
        if not found or upload.post_id is distinct from p_post or upload.draft_id is distinct from p_draft
            or upload.region is distinct from p_region or upload.ip_fingerprint is distinct from p_fingerprint
            or upload.status <> 'reserved' or upload.expires_at <= now()
            or upload.storage_path is distinct from ('community-posts/' || p_draft::text || '/' || item_id::text || '.webp')
            or item->>'image_url' is null then
          raise exception 'Invalid upload draft' using errcode = '22023';
        end if;
      else
        raise exception 'Invalid image operation' using errcode = '22023';
    end case;
  end loop;

  -- Detach from this post only. Do not enqueue storage deletion for old objects.
  delete from public.community_post_images where post_id = p_post and not (id = any(retained));
  for item in select value from jsonb_array_elements(p_plan) loop
    item_id := (item->>'id')::uuid;
    if item->>'kind' = 'existing' then
      update public.community_post_images set sort_order = ordinal where id = item_id and post_id = p_post;
    else
      select * into strict upload from public.community_upload_drafts where id = item_id;
      insert into public.community_post_images(post_id,storage_path,image_url,width,height,byte_size,sort_order)
      values(p_post,upload.storage_path,item->>'image_url',upload.width,upload.height,upload.byte_size,ordinal);
      update public.community_upload_drafts set status = 'linked' where id = item_id;
    end if;
    ordinal := ordinal + 1;
  end loop;

  update public.community_posts set title = p_fields->>'title', body = p_fields->>'body',
    author_name = p_fields->>'author_name', area = p_fields->>'area',
    contact_type = p_fields->>'contact_type', contact_value = p_fields->>'contact_value'
  where id = p_post;
  result := jsonb_build_object('ok',true,'status',post.status,'image_count',ordinal,'actor',p_actor);
  insert into public.community_image_edit_requests(request_id,post_id,result) values(p_request,p_post,result);
  return result;
end;
$$;

revoke all on function public.community_admin_save_promotion_images(uuid,text,timestamptz,jsonb,jsonb,uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.community_admin_save_promotion_images(uuid,text,timestamptz,jsonb,jsonb,uuid,text,uuid,uuid) to service_role;

commit;
