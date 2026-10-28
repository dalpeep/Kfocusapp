import legacy from '../legacy-functions/smart-flyer-public.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
