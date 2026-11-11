import legacy from '../legacy-functions/generate-content-suite.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
