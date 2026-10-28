import legacy from '../legacy-functions/generate-dalpick-image.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
