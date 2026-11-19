/* Deterministic Range pagination with completeness metadata. */
(function(root,factory){
  const api=factory();
  root.DtmPagination=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis,function(){
  'use strict';
  async function collectPages({fetchPage,pageSize=1000,maxPages=100,keyOf=row=>row?.id,validRow=row=>!!row}){
    const rows=[],seen=new Set();let from=0,pages=0,duplicates=0,malformed=0;
    try{
      while(pages<maxPages){
        const to=from+pageSize-1;
        const result=await fetchPage({page:pages,from,to,pageSize});
        const batch=Array.isArray(result)?result:Array.isArray(result?.rows)?result.rows:null;
        if(!batch)throw new Error(`Invalid page ${pages+1} response`);
        for(const row of batch){
          if(!validRow(row)){malformed++;continue;}
          const key=keyOf(row);
          if(key===null||key===undefined||String(key)===''){malformed++;continue;}
          const normalized=String(key);
          if(seen.has(normalized)){duplicates++;continue;}
          seen.add(normalized);rows.push(row);
        }
        pages++;
        const explicitDone=!Array.isArray(result)&&result.done===true;
        if(explicitDone||batch.length===0||(!result?.nextFrom&&batch.length<pageSize))return {status:'live',rows,pages,duplicates,malformed,complete:true};
        const next=Number(result?.nextFrom);
        from=Number.isFinite(next)&&next>from?next:from+batch.length;
        if(batch.length===0)break;
      }
      return {status:'partial',rows,pages,duplicates,malformed,complete:false,error:new Error(`Pagination exceeded ${maxPages} pages`)};
    }catch(error){
      return {status:rows.length?'partial':'failed',rows,pages,duplicates,malformed,complete:false,error};
    }
  }
  function contentRange(value=''){
    const match=String(value).match(/^(\d+)-(\d+)\/(\d+|\*)$/);
    if(!match)return null;
    return {start:Number(match[1]),end:Number(match[2]),total:match[3]==='*'?null:Number(match[3])};
  }
  async function fetchPostgrest({url,headers={},signal,pageSize=1000,maxPages=100,keyOf,validRow,fetchImpl=fetch}){
    return collectPages({pageSize,maxPages,keyOf,validRow,fetchPage:async({from,to})=>{
      const res=await fetchImpl(url,{cache:'no-store',signal,headers:{...headers,Range:`${from}-${to}`,'Range-Unit':'items',Prefer:'count=exact'}});
      if(!res.ok)throw new Error(`PostgREST ${res.status}`);
      const rows=await res.json();
      const range=contentRange(res.headers?.get?.('content-range'));
      return {rows,nextFrom:range?range.end+1:from+(Array.isArray(rows)?rows.length:0),done:range?.total!=null?range.end+1>=range.total:Array.isArray(rows)&&rows.length<pageSize};
    }});
  }
  return {collectPages,contentRange,fetchPostgrest};
});
