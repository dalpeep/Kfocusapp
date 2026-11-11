import legacy from '../legacy-functions/collect-newsroom.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
