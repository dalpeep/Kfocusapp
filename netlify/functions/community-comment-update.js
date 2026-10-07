const S=require('./lib/community-security'),M=require('./lib/community-comment-mutate');
exports.handler=S.handler(event=>M.comment(event,'update'));
