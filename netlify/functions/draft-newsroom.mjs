import legacy from '../legacy-functions/draft-newsroom.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
