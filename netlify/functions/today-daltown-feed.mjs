import legacy from '../legacy-functions/today-daltown-feed.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
