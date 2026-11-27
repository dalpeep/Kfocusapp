-- Stop new confirmations and dispatch while retaining all campaign data.
begin;
revoke execute on function public.business_mail_confirm_campaign_v1(uuid,uuid,uuid[],uuid),
  public.business_mail_claim_delivery_v1(uuid),public.business_mail_finish_delivery_v1(uuid,text,text,text)
  from service_role;
commit;
