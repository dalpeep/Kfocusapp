/* DaltownMap request identity, de-duplication and stale-commit guard. */
(function(root,factory){
  const api=factory();
  root.DtmRequestCoordinator=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(){
  'use strict';
  const inflight=new Map();
  const cache=new Map();
  const scopes=new Map();
  const counters={started:0,deduped:0,aborted:0,committed:0,stale:0,failed:0,cacheHit:0};
  const stable=value=>{
    if(value===null||value===undefined)return '';
    if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
    if(typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${k}:${stable(value[k])}`).join(',')}}`;
    return String(value);
  };
  function identity(resource,conditions={}){return `${String(resource)}|${stable(conditions)}`;}
  function begin(scope,id,{abort=true}={}){
    const name=String(scope),previous=scopes.get(name);
    if(previous&&previous.id===id)return previous;
    if(abort&&previous?.controller&&!previous.controller.signal.aborted){previous.controller.abort();counters.aborted++;}
    const token={scope:name,id,generation:(previous?.generation||0)+1,controller:typeof AbortController==='function'?new AbortController():null};
    scopes.set(name,token);
    return token;
  }
  function current(token){const active=scopes.get(token?.scope);return !!active&&active===token&&active.id===token.id;}
  function fetchShared(id,loader,{ttl=0,signal}={}){
    const now=Date.now(),cached=cache.get(id);
    if(ttl>0&&cached&&now-cached.at<ttl){counters.cacheHit++;return Promise.resolve(cached.value);}
    if(inflight.has(id)){counters.deduped++;return inflight.get(id);}
    counters.started++;
    const promise=Promise.resolve().then(()=>loader({signal,id})).then(value=>{
      if(ttl>0)cache.set(id,{at:Date.now(),value});
      return value;
    }).finally(()=>{if(inflight.get(id)===promise)inflight.delete(id);});
    inflight.set(id,promise);
    return promise;
  }
  async function run({scope,resource,conditions={},loader,commit,fallback,ttl=0,force=false,abort=true}){
    const id=identity(resource,conditions),token=begin(scope,id,{abort});
    try{
      const value=await fetchShared(id,loader,{ttl:force?0:ttl,signal:token.controller?.signal});
      if(!current(token)){counters.stale++;return {status:'stale',value,committed:false,id};}
      if(commit)await commit(value,token);
      counters.committed++;
      return {status:'committed',value,committed:true,id};
    }catch(error){
      if(error?.name==='AbortError'||!current(token)){counters.stale++;return {status:'stale',error,committed:false,id};}
      counters.failed++;
      if(fallback)await fallback(error,token);
      return {status:'failed',error,committed:false,id};
    }
  }
  function invalidate(resource=''){
    const prefix=resource?`${resource}|`:'';
    for(const key of cache.keys())if(!prefix||key.startsWith(prefix))cache.delete(key);
  }
  function debug(){return {...counters,inflight:inflight.size,cache:cache.size,scopes:scopes.size};}
  function reset(){for(const token of scopes.values())token.controller?.abort();inflight.clear();cache.clear();scopes.clear();Object.keys(counters).forEach(k=>counters[k]=0);}
  return {identity,begin,current,fetchShared,run,invalidate,debug,reset};
});
