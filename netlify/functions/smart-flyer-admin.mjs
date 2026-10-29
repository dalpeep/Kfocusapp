import legacy from '../legacy-functions/smart-flyer-admin.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
