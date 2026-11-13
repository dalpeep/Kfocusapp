# Coupon production readiness

The public redemption screen trusts a button click. It inserts a browser-supplied
coupon_redemptions row and patches coupons.used_count separately. Both anon and
authenticated can insert redemption rows, and there is no unique redemption
proof for a display coupon. A trigger that counts those rows would still allow
fabricated usage. The draft keeps that legacy counter path for compatibility
and must not be applied as the final security migration.

Move display redemption to a server transaction after a verified merchant
confirmation. Use an expiring, single-use redemption identifier bound to the
coupon and business. The server must check coupon activity and expiry, consume
the identifier atomically, insert the redemption and increment the existing
counter once. Preserve all previous rows and counter values. After the browser
uses the new flow, block direct browser redemption inserts and counter writes.
Do not add a second increment to the existing campaign admin route, which
already writes a redemption and then increments the counter with server access.

The draft checks regional administrators against every linked business,
including legacy coupons with NULL region. The draft FK change prevents
deleting a business from implicitly deleting its coupons. Verify legacy
administrator delete behavior and plan an explicit archive workflow before
applying it. The rollback restores the original FK definition.

The customer screen requests a five-minute proof for an active display coupon
at a visible pilot business with an approved owner. No customer login is
required. Only the authenticated owner Edge route can consume the proof.
The RPC locks the proof and coupon, records one use, and returns the original
receipt on replay. Its rollback revokes RPC access and preserves records.

The cutover draft blocks browser writes to redemption records and direct
counter edits. Before applying it, verify the existing campaign administrator
route with a server credential and confirm real merchant access for display
coupons. Keep the Netlify deploy, Edge bundle and both SQL rollback scripts
ready. Old cached browser versions will lose the direct redemption path after
cutover and must reload. Keep the use flow off if production end-to-end
compatibility cannot be established.
