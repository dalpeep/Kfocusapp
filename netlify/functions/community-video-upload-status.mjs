import legacy from '../legacy-functions/community-video-upload-status.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
