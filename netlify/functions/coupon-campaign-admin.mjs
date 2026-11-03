import legacy from '../legacy-functions/coupon-campaign-admin.js';
import v2 from '../legacy-functions/lib/owner-coupon-v2.js';
import security from '../legacy-functions/lib/operational-security/admin-scope.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(security.makeDispatch('campaign',v2.makeDispatch('admin',legacy.handler)));
