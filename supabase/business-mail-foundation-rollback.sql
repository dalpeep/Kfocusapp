-- Disable entry points while retaining consent and campaign records.
begin;
revoke execute on function public.business_mail_admin_v1(text,jsonb) from authenticated;
revoke execute on function public.business_mail_consume_token_v1(text,text,text) from service_role;
revoke execute on function public.business_mail_prepare_queue_v1(uuid) from service_role;
commit;
