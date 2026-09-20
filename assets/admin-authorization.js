(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.DtmAdminAuthorization=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const ROLES=new Set(['super_admin','regional_editor']);
  const AREAS=new Set(['dallas','colorado']);
  const text=value=>String(value||'').trim().toLowerCase();
  function normalizeArea(value){const area=text(value);return area==='denver'?'colorado':area;}
  function isProfilesMissing(error){
    if(!error)return false;
    const code=text(error.code),message=text(error.message);
    return code==='42p01'||code==='pgrst205'||(/profiles/.test(message)&&/(does not exist|schema cache|could not find)/.test(message));
  }
  function metadataProfile(user){
    const app=user?.app_metadata||{},meta=user?.user_metadata||{};
    return {role:text(app.role||meta.role),area:normalizeArea(app.area||meta.area)};
  }
  function validate(candidate,source){
    const role=text(candidate?.role),area=normalizeArea(candidate?.area);
    if(!ROLES.has(role))return {ok:false,reason:'invalid_role',role,area,source};
    if(role==='regional_editor'&&!AREAS.has(area))return {ok:false,reason:'invalid_area',role,area,source};
    return {ok:true,role,area:role==='super_admin'?(area||'all'):area,source};
  }
  function resolve({user,profile,error}={}){
    if(!user)return {ok:false,reason:'unauthenticated'};
    if(error&&!isProfilesMissing(error))return {ok:false,reason:'profile_lookup_failed',error};
    if(profile)return validate(profile,'profile');
    return validate(metadataProfile(user),'metadata');
  }
  function permitsArea(access,area){
    if(!access?.ok)return false;
    if(access.role==='super_admin')return true;
    return access.role==='regional_editor'&&access.area===normalizeArea(area);
  }
  return {ROLES,AREAS,normalizeArea,isProfilesMissing,metadataProfile,resolve,permitsArea};
});
