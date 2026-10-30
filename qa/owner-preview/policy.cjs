'use strict';
// Preparation only: not imported by a build entrypoint or deployed Function.
const QA = 'hseaeafmmjnbynfyynao';
const PROD = 'ydrxuqmjzayejlnjzzew';
const SITE = 'ec0bc146-8184-4627-90e0-df82ec2b06f9';
function inspectRegistration(env) {
  return {
    urlPresent: Boolean(env.SUPABASE_URL),
    anonPresent: Boolean(env.SUPABASE_ANON_KEY),
    servicePresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    qaUrl: env.SUPABASE_URL === `https://${QA}.supabase.co`,
    projectsDistinct: QA !== PROD,
    // Presence and JWT claims never establish authentication/project binding.
    serviceAuthentication: 'NOT_TESTED',
    serviceProjectBinding: 'UNVERIFIED'
  };
}
function assess(env, approval) {
  const approved = approval?.buildApproved === true && approval?.runtimeApproved === false;
  const pr = String(approval?.pr ?? '');
  const checks = {
    approved,
    qaSite: env.SITE_ID === SITE,
    context: env.CONTEXT === 'deploy-preview',
    platform: env.NETLIFY === 'true' && env.PULL_REQUEST === 'true',
    pr: /^[1-9]\d*$/.test(pr) && env.REVIEW_ID === pr,
    sourceHead: /^dev\/owner-qa-[a-z0-9-]+$/.test(approval?.head ?? '') && env.HEAD === approval.head,
    checkout: env.BRANCH === `pull/${pr}/head` || env.BRANCH === `refs/pull/${pr}/head`,
    commit: /^[a-f0-9]{40}$/.test(approval?.commit ?? '') && env.COMMIT_REF === approval.commit,
    qaUrl: env.SUPABASE_URL === `https://${QA}.supabase.co`,
    credentialsPresent: Boolean(env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY),
    ownerOff: env.OWNER_UUID_ENABLED === 'false',
    workerOff: env.OWNER_NOTIFICATION_WORKER_ENABLED === 'false',
    mock: env.OWNER_NOTIFICATION_MODE === 'mock',
    emailOff: !env.RESEND_API_KEY && !env.OWNER_QA_RESEND_API_KEY,
  };
  const failed = Object.keys(checks).filter(k => !checks[k]);
  return { allowed: failed.length === 0, code: failed.length ? 'QA_PREVIEW_BLOCKED' : 'QA_METADATA_MATCH_ONLY', checks, failed,
    authentication: 'NOT_TESTED', runtimeEnabled: false };
}
module.exports = { inspectRegistration, assess };
