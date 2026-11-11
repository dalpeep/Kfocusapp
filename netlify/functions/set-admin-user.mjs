import legacy from '../legacy-functions/set-admin-user.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
