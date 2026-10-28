import legacy from '../legacy-functions/sendPush.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
