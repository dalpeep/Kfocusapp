import legacy from '../raffle/auto.cjs';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
export const config = {"schedule":"*/10 * * * *"};
