import legacy from '../legacy-functions/google-place-rating.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
