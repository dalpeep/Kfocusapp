BEGIN;
REVOKE EXECUTE ON FUNCTION public.owner_menu_v1(uuid,uuid,jsonb) FROM service_role;
REVOKE SELECT ON public.business_menu_items FROM anon,authenticated;
COMMIT;
