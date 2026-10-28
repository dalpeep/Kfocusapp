// Public, production-only routing constants. Credentials remain in Netlify secrets.
const PRODUCTION_SITE_ID='e2667e40-0999-42a3-892b-2b2edff61434';
const CONFIG=Object.freeze({
  origin:'https://daltownmap.com/',
  admissionUrl:'https://community-video-admission-production-729709801821.us-central1.run.app/',
  objectPrefix:'production'
});

function forRequest(event,env=process.env){
  if(env.SITE_ID!==PRODUCTION_SITE_ID||
     String(event?.headers?.host||'').toLowerCase()!==new URL(CONFIG.origin).host)
    return null;
  return CONFIG;
}

module.exports={forRequest};
