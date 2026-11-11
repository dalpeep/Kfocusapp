import legacy from '../legacy-functions/community-post-extend.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
