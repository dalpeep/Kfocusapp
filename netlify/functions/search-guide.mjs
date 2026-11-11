import legacy from '../legacy-functions/search-guide.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
