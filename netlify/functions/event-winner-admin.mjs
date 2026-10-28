import legacy from '../raffle/event-admin.cjs';
import { adapt } from '../migration/adapter.mjs';
export default adapt(legacy.handler);
