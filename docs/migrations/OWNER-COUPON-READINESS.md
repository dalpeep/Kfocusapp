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

The proof draft implements a five-minute bearer UUID issued by the owner Edge
route after existing ownership checks. Redemption locks the proof and coupon
and records one use. Replays return the original receipt. Rollback revokes RPC
access and preserves issued proofs, counters and usage records. Customer and
merchant screens still need to exchange the proof. Keep this draft off production
while legacy clients use direct writes and there is no verified merchant flow
for businesses outside the owner pilot.
