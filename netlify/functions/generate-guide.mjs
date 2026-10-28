import legacy from '../legacy-functions/generate-guide.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
