import legacy from '../legacy-functions/raffle-auto-draw.js';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
export const config = {"schedule":"*/10 * * * *"};
