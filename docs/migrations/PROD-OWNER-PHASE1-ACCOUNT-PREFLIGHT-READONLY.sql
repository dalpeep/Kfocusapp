BEGIN TRANSACTION READ ONLY;

-- After the operating cohort is approved, replace each NULL with its production Auth UUID.
WITH cohort(label, actor) AS (
  VALUES ('administrator', NULL::uuid), ('owner_1', NULL::uuid), ('owner_2', NULL::uuid)
)
SELECT c.label,
       c.actor IS NOT NULL AND (SELECT count(DISTINCT actor) FROM cohort) = 3 AS distinct_cohort,
       u.id IS NOT NULL AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
         AND (u.banned_until IS NULL OR u.banned_until <= now()) AS active_verified,
       CASE WHEN c.label = 'administrator' THEN EXISTS (
         SELECT 1 FROM public.profiles p WHERE p.user_id = c.actor
           AND (p.role = 'super_admin' OR (p.role = 'regional_editor' AND p.area = 'dallas'))
       ) ELSE NOT EXISTS (
         SELECT 1 FROM public.profiles p WHERE p.user_id = c.actor
           AND p.role IN ('admin', 'super_admin', 'regional_editor')
       ) AND coalesce(u.raw_app_meta_data->>'role', '') NOT IN ('admin', 'super_admin', 'regional_editor')
       END AS expected_role
FROM cohort c LEFT JOIN auth.users u ON u.id = c.actor
ORDER BY c.label;

ROLLBACK;
