import legacy from '../legacy-functions/config.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
