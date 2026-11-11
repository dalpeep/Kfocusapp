import source from '../../../netlify/legacy-functions/community-post-create.js';
import {communityWrite} from '../community-write.mjs';

export default communityWrite(source.handler, body => Boolean(body.turnstile_token) &&
  (body.upload_ids === undefined || (Array.isArray(body.upload_ids) && body.upload_ids.length === 0)));
