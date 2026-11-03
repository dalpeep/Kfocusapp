import legacy from '../legacy-functions/coupon-campaign-enter.js';
import v2 from '../legacy-functions/lib/owner-coupon-v2.js';
import redemption from '../legacy-functions/lib/operational-security/display-redemption.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(redemption.makeDispatch(v2.makeDispatch('enter',legacy.handler)));
