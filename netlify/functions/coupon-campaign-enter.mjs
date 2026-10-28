import legacy from '../legacy-functions/coupon-campaign-enter.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
