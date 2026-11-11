import legacy from '../legacy-functions/newsroom-daily.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
export const config = {"schedule":"0 11 * * *"};
