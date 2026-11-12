# Owner content integration

The current owner pilot stores approvals separately from public businesses. A scoped
approval with a non-null public business ID is the required link for public gallery
writes. The existing pilot status RPC checks the actor, Auth status and database switch.
Gallery operations additionally check current ownership and business scope inside the
same transaction. The administrator approval role alone does not grant gallery edits.
The Edge runtime uses its existing Supabase-hosted key and defaults the gallery route
to OFF.

| Content | Existing production contract | Integration status |
| --- | --- | --- |
| Gallery | businesses.gallery_urls and public-images, consumed by the existing business detail UI | Local upload and URL list editing. New URLs must resolve to an existing Storage object in the selected business's reserved prefix. The RPC rejects removal of legacy gallery references. |
| Menu | Prior development has a bilingual menu document and public media adapter | Review menu fields and a dedicated public read projection before adding a table or using the old draft with subscription prerequisites. |
| Coupon | coupons, including business_id, business_ids and campaign delivery options | Use the display workflow first. Protect multi-business links and keep campaign delivery, notifications and shared records outside owner editing until verified. |
| Event | posts and existing community event filtering | Reuse event classification and publication windows. Verify approval and public visibility rules before opening writes. |
| Special | business_specials and business_special_items | Reuse schedule fields and update parent/child rows atomically with business scoping. |

The Edge Function uploads JPG, PNG or WebP files up to 4 MiB using its
existing service role, a new random object key, and upsert disabled. It checks
current ownership before upload and again when saving the gallery. Removing a
new photo detaches its URL. Files are retained. If an upload succeeds and the
gallery save fails, the object may remain unreferenced. The design requires no
Storage policy change provided the bucket permits the image types and the
reserved prefix cannot be written by untrusted users.

Before applying SQL, review the target catalog with
PROD-OWNER-PHASE2-CONTENT-PREFLIGHT-READONLY.sql and confirm the backup and Storage
restore coverage. The draft adds only owner_pilot_gallery_v1 with service_role
execution, and changes no rows on installation. Run isolated QA using a fixture gallery,
including stale writes, replay, same/other owner, regional administrator and public detail
rendering at desktop and mobile widths. The app requires both the existing phase-one
switches and OWNER_PHASE2_GALLERY_ENABLED=true to expose the new route. Verify the
Edge JWT setting on the target before any release.

To undo installation, disable the gallery Edge flag and use the previous app/Edge
release as needed. Drop public.owner_pilot_gallery_v1(uuid,uuid,jsonb,jsonb) in a
reviewed transaction. That removes only the added RPC. To undo actual content edits,
restore the saved pre-change gallery for the specific business after checking for
subsequent administrator edits. The install itself does not change Storage objects.
