import legacy from '../legacy-functions/community-video-upload-admit.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
