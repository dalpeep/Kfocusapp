import legacy from '../raffle/admin.cjs';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
