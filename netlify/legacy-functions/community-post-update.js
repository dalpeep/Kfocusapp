const S=require('./lib/community-security'),M=require('./lib/community-mutate'),G=require('./lib/community-maintenance');exports.handler=S.handler(e=>G.editGate(e)||M.post(e,'update'));
