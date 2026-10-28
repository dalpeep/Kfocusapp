import legacy from '../legacy-functions/traffic-source-track.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
