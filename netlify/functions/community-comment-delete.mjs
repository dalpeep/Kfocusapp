import legacy from '../legacy-functions/community-comment-delete.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
