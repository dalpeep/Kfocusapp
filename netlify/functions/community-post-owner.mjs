import legacy from '../legacy-functions/community-post-owner.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
