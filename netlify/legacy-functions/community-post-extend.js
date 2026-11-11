const S=require('./lib/community-security'),M=require('./lib/community-mutate');
exports.handler=S.handler(event=>M.post(event,'extend'));
