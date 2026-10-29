import notifications from '../legacy-functions/lib/owner-notifications.js';
// Netlify Scheduled Functions cannot be invoked through a public URL.
// All providers/DB access remain disabled unless the explicit Canary gate passes.
export default async()=>{const result=await notifications.makeWorker()();console.info('OWNER_NOTIFICATION_WORKER',result);if(['config_blocked','db_unavailable','ack_pending'].includes(result.state))return new Response(null,{status:503});return new Response(null,{status:204});};
export const config={schedule:'*/5 * * * *'};
