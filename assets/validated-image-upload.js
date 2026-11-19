(()=>{'use strict';
 window.installValidatedImageUpload=(db,scope={})=>{
  if(db.__validatedImages)return db;db.__validatedImages=true;
  const from=db.storage.from.bind(db.storage),urls=new Map(),paths=new Map();
  db.storage.from=bucket=>{const api=from(bucket);if(bucket!=='public-images')return api;
   const publicUrl=api.getPublicUrl.bind(api);
   api.getPublicUrl=(path,options)=>urls.has(path)?{data:{publicUrl:urls.get(path)}}:publicUrl(path,options);
   api.upload=api.update=async(path,file,options={})=>{
    try{const originalPath=path;
     const {data:{session}}=await db.auth.getSession();if(!session)throw Error('AUTH_REQUIRED');
     const mime=options.contentType||file.type,size=file.size;
     if(!size||size>5242880||!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('IMAGE_SIZE_OR_MIME_INVALID');
     // Existing admin folder names become region-scoped without changing saved legacy URLs.
     if(!path.startsWith('owner-v1/')){const profile=await db.from('profiles').select('role,area').eq('user_id',session.user.id).single();if(profile.error)throw Error('ADMIN_REQUIRED');const selected=scope.region?.();const area=profile.data.role==='super_admin'?(selected==='all'?'dallas':selected):profile.data.area;if(!['dallas','colorado'].includes(area))throw Error('ADMIN_REGION_REQUIRED');path='owner-v1/'+area+'/uploads/'+path.split('/').pop();}
     const request=async body=>{const r=await fetch('/.netlify/functions/owner-image-uuid',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.code||'IMAGE_REJECTED');return data;};
     const body={path,mime,size,...(options.purpose==='coupon'?{purpose:'coupon',business_id:options.business_id}:{})},ready=await request({...body,action:'prepare'});
     const uploaded=await from('owner-portal-quarantine').uploadToSignedUrl(ready.staging_path,ready.upload_token,file,{contentType:mime});
     if(uploaded.error)throw Error('STAGING_UPLOAD_FAILED');
     const result=await request({...body,action:'publish',staging_path:ready.staging_path});
     paths.set(originalPath,result.path);urls.set(originalPath,result.publicUrl);urls.set(path,result.publicUrl);return {data:{path:result.path,fullPath:'public-images/'+result.path,publicUrl:result.publicUrl},error:null};
    }catch(e){return {data:null,error:new Error(e.message||'IMAGE_REJECTED')};}
   };
   api.remove=async items=>{try{if(!Array.isArray(items)||!items.length||items.length>10)throw Error('INVALID_DELETE_BATCH');const {data:{session}}=await db.auth.getSession();if(!session)throw Error('AUTH_REQUIRED');for(const input of items){const path=paths.get(input)||input;const r=await fetch('/.netlify/functions/owner-image-uuid',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'delete',path})});const result=await r.json();if(!r.ok)throw Error(result.code||'IMAGE_DELETE_FAILED');}return {data:items.map(name=>({name})),error:null};}catch(e){return {data:null,error:new Error(e.message||'IMAGE_DELETE_FAILED')};}};return api;
  };return db;
 };
})();
