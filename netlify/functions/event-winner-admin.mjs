import legacy from '../legacy-functions/event-winner-admin.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
