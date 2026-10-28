-- Read-only preflight, production execution requires approval.
SELECT column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('coupons','coupon_entries','event_draw_winners')
 ORDER BY table_name,ordinal_position;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='event_draw_run';
SELECT count(*) AS campaigns_already_over_capacity FROM public.coupons c
 WHERE c.delivery_mode='raffle' AND (SELECT count(*) FROM public.coupon_entries e WHERE e.coupon_id=c.id::text AND e.status IN ('winner','redeemed'))>greatest(1,least(500,coalesce(nullif(c.winner_count,0),1)));
-- Existing historical excess, if any, is reported, never deleted by this migration.
