import legacy from '../legacy-functions/coupon-used-notify.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
