import legacy from '../legacy-functions/coupon-campaign-lib.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt((...args) => legacy.handler(...args));
