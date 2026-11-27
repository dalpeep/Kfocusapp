-- Revoke entry points while retaining collected consent, suppressions and history.
begin;
revoke execute on function public.business_mail_issue_token_v1(uuid,text,text,text),
  public.business_mail_record_event_v1(text,text,text,boolean) from service_role;
revoke execute on function public.business_mail_results_v1(uuid) from authenticated;
commit;
