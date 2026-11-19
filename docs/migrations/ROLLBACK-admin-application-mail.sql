BEGIN;
DROP TRIGGER enqueue_admin_application_mail ON public.business_requests;
DROP TRIGGER enqueue_admin_application_mail ON public.advertising_requests;
DROP TRIGGER enqueue_admin_application_mail ON owner_portal_pilot.requests;
DROP TRIGGER enqueue_admin_application_mail ON owner_portal_pilot.content_reviews;
DROP FUNCTION owner_portal_pilot.enqueue_admin_application_mail();
DROP FUNCTION public.admin_mail_settings_v1(uuid,text,jsonb);
DROP FUNCTION public.admin_mail_confirm_v1(text);
DROP FUNCTION public.admin_mail_work_v1(text,jsonb);
-- Disable the scheduled worker and restore the previous frontend separately.
-- Keep settings, queue and delivery history for audit.
COMMIT;
