import legacy from '../legacy-functions/community-admin.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
