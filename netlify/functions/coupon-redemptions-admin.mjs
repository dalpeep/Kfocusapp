import legacy from '../legacy-functions/coupon-redemptions-admin.js';
import security from '../legacy-functions/lib/operational-security/admin-scope.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(security.makeDispatch('redemptions',legacy.handler));
