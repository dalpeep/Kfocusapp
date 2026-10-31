'use strict';
// Netlify ignore semantics: 0=skip, 1=run. No I/O, auth or diagnostic output.
function shouldBuild(env,load=()=>require('./build-only.cjs')){
 try{
  const {approval,preflight}=load(),seal=approval(env);
  return seal?.serviceAuthenticationApproved===true&&seal.execution==='preview-off'&&preflight(env,seal).allowed===true;
 }catch{return false;}
}
module.exports={shouldBuild};
if(require.main===module)process.exitCode=shouldBuild(process.env)?1:0;
