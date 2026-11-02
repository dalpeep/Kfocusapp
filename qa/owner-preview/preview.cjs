'use strict';
// Keep the Netlify command stable. CLI diagnostics start before policy imports.
if(require.main!==module)module.exports=require('./selector.cjs');
else if(process.argv.length===3&&process.argv[2]==='--ignore'){
 try{process.exitCode=require('./selector.cjs').select(process.env)?1:0;}
 catch{process.exitCode=0;} // Module errors must skip, not authorize a build.
}else{
 const {emit,reason}=require('./diagnostics.cjs');
 emit('ENTRY');
 if(process.argv.length!==2){emit('STOP',{code:'QA_PREVIEW_ARGUMENT_BLOCKED',exitCode:78});process.exitCode=78;}
 else{
  let selector;
  try{selector=require('./selector.cjs');}
  catch{emit('STOP',{code:'QA_MODULE_LOAD_FAILED',exitCode:78});process.exitCode=78;}
  if(selector)selector.run(process.env,undefined,emit).then(()=>emit('STOP',{code:'QA_BUILD_COMPLETE',exitCode:0})).catch(error=>{
   const code=reason(error);
   emit('STOP',{code,exitCode:78});
   console.error(code); // Fixed code only; never original message or stack.
   process.exitCode=78;
  });
 }
}
