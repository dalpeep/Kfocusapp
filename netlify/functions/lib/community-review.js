// Conservative review signals for newly created Community posts. Validation,
// Turnstile, rate limiting, and upload verification happen before this step.
const URL=/(?:https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|kr|us|app|info|xyz|link|shop)\b)/gi;
const ABUSE=/(?:시발|씨발|병신|개새끼|좆|fuck|shit|bitch)/i;
const PROMOTION=/(?:무료\s*수익|수익\s*보장|고수익\s*보장|카지노|토토|도박|대출\s*승인|guaranteed\s*(?:income|profit)|easy\s*money)/i;
const PERSONAL_ID=/(?:\b\d{3}-\d{2}-\d{4}\b|\b\d{6}\s*[- ]\s*[1-4]\d{6}\b)/;
const AUTO_PUBLISH_CATEGORIES=new Set(['job_hiring','job_seeking','marketplace','neighborhood','qna']);

function reviewPost(post,details){
  if(!AUTO_PUBLISH_CATEGORIES.has(post.category))return{status:'pending',reason:'category_not_enabled'};
  // The optional structured video link has already passed the existing
  // YouTube/Instagram/Facebook validator. Review only unstructured links.
  const content=[post.title,post.body,post.author_name,...Object.entries(details||{}).filter(([key,v])=>key!=='external_video_url'&&typeof v==='string').map(([,v])=>v)].join(' ');
  // Structured video URLs are canonicalized by validateVideoLink. All other
  // outbound links require a human review, including validated HTTPS event links.
  if((content.match(URL)||[]).length)return{status:'pending',reason:'external_link'};
  if(ABUSE.test(content))return{status:'pending',reason:'abuse'};
  if(PROMOTION.test(content))return{status:'pending',reason:'promotion'};
  if(PERSONAL_ID.test(content))return{status:'pending',reason:'personal_info'};
  if(/(.)\1{7,}/u.test(content))
    return{status:'pending',reason:'spam_pattern'};
  return{status:'approved',reason:null};
}

module.exports={reviewPost};
