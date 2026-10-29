import legacy from '../legacy-functions/coupon-used-notify.js';
import v2 from '../legacy-functions/lib/owner-coupon-v2.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(v2.makeDispatch('notify',legacy.handler));
