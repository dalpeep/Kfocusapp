import legacy from '../legacy-functions/daltown-daily-core.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
