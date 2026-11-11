'use strict';
exports.merge=(policy,e)=>({...policy,subscription_plan:e.plan,images:e.plan==='PREMIUM'&&e.features.photos===true,custom_image:e.plan==='PREMIUM'&&e.features.photos===true&&e.features.coupons===true,free_description:e.plan==='PREMIUM'?false:policy.free_description,premium_features:e.features});
exports.read=async(db,actor,bid)=>{const r=await db.rpc('owner_media_api',{p_actor:actor,p_command:{action:'read',business_id:bid}});if(r.error)throw Object.assign(Error('구독 권한을 확인하지 못했습니다.'),{status:503});return r.data;};
