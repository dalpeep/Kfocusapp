export function isWorkerEventRoute(method,url,headers={}){
  if(method!=='POST')return false;
  let pathname;
  try{pathname=new URL(String(url||''),'http://worker.invalid').pathname}catch{return false}
  if(pathname!=='/'&&pathname!=='/event')return false;
  return headers['ce-specversion']==='1.0'&&
    headers['ce-type']==='google.cloud.storage.object.v1.finalized'&&
    typeof headers['ce-id']==='string'&&headers['ce-id'].length>0&&
    typeof headers['ce-source']==='string'&&headers['ce-source'].length>0;
}
