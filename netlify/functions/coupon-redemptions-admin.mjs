import legacy from '../legacy-functions/coupon-redemptions-admin.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
