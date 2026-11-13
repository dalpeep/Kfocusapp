BEGIN;
DROP POLICY IF EXISTS owner_phase2_specials_parent_delete_guard ON public.businesses;
DROP FUNCTION IF EXISTS public.business_has_protected_specials(uuid);
CREATE OR REPLACE FUNCTION public.business_specials_admin_access(target_business_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare admin_role text; admin_area text;
begin
  if auth.uid() is null then return false; end if;
  if to_regclass('public.profiles') is not null then
    execute 'select role, area from public.profiles where user_id=$1 limit 1'
      into admin_role,admin_area using auth.uid();
  end if;
  if coalesce(admin_role,'')='' then
    admin_role=coalesce(auth.jwt()->'app_metadata'->>'role',auth.jwt()->'user_metadata'->>'role','');
    admin_area=coalesce(auth.jwt()->'app_metadata'->>'area',auth.jwt()->'user_metadata'->>'area','');
  end if;
  if admin_role='super_admin' then return true; end if;
  if admin_role<>'regional_editor' then return false; end if;
  if admin_area='denver' then admin_area='colorado'; end if;
  return exists(select 1 from public.businesses b where b.id::text=target_business_id and b.region=admin_area);
end;
$function$;
COMMIT;
