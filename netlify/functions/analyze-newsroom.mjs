import legacy from '../legacy-functions/analyze-newsroom.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
