import legacy from '../legacy-functions/generate-campaign-image.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
