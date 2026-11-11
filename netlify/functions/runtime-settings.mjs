import legacy from '../legacy-functions/runtime-settings.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
