import source from '../../../netlify/legacy-functions/community-admin.js';
import {communityWrite} from '../community-write.mjs';

export default communityWrite(source.handler, body => body.action === 'status' &&
  ['approved', 'deleted'].includes(body.status) &&
  typeof body.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id));
