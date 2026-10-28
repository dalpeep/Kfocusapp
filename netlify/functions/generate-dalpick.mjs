import legacy from '../legacy-functions/generate-dalpick.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
