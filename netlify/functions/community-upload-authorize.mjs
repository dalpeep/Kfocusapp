import legacy from '../legacy-functions/community-upload-authorize.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
