import legacy from '../legacy-functions/daily-core-refresh.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
