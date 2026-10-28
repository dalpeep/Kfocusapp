import legacy from '../legacy-functions/ai-daily-home.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
