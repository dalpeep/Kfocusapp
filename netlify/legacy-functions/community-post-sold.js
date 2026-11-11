const S=require('./lib/community-security'),M=require('./lib/community-mutate');exports.handler=S.handler(e=>M.post(e,'sold'));
