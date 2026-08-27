const {json,rest,verifyAdmin}=require('./coupon-campaign-lib');

function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
async function getFlyer(id){
  const r=await rest(`weekly_flyers?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return Array.isArray(r)?r[0]:null;
}
async function getItems(id){
  const r=await rest(`weekly_flyer_items?select=*&flyer_id=eq.${encodeURIComponent(id)}&order=id.asc`);
  return Array.isArray(r)?r:[];
}
async function patchFlyer(id,patch,extraQuery=''){
  const q=`weekly_flyers?id=eq.${encodeURIComponent(id)}${extraQuery||''}`;
  const r=await rest(q,{
    method:'PATCH',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify(patch)
  });
  return Array.isArray(r)?r[0]||null:null;
}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return json(200,{ok:true});
  if(event.httpMethod!=='POST') return json(405,{ok:false,error:'POST only'});
  try{
    await verifyAdmin(event);
    const b=JSON.parse(event.body||'{}');
    const action=String(b.action||'').trim();
    const id=num(b.id);

    if(!['set_status','delete','activate'].includes(action)){
      return json(400,{ok:false,error:'지원하지 않는 smart flyer admin action입니다.'});
    }
    if(!id) return json(400,{ok:false,error:'전단 ID가 필요합니다.'});

    const flyer=await getFlyer(id);
    if(!flyer) return json(404,{ok:false,error:'전단을 찾을 수 없습니다.'});

    if(action==='set_status'){
      const patch={updated_at:new Date().toISOString()};
      if(b.status!==undefined) patch.status=String(b.status);
      if(b.show_on_home!==undefined) patch.show_on_home=!!b.show_on_home;
      if(String(b.status||'').toLowerCase()==='archived') patch.show_on_home=false;
      const updated=await patchFlyer(id,patch);
      return json(200,{ok:true,source:'netlify_service_role',flyer:updated});
    }

    if(action==='delete'){
      const items=await getItems(id);
      await rest(`weekly_flyer_items?flyer_id=eq.${encodeURIComponent(id)}`,{
        method:'DELETE',
        headers:{Prefer:'return=representation'}
      });
      const deleted=await rest(`weekly_flyers?id=eq.${encodeURIComponent(id)}`,{
        method:'DELETE',
        headers:{Prefer:'return=representation'}
      });
      const count=Array.isArray(deleted)?deleted.length:0;
      if(!count) return json(409,{ok:false,error:'전단 삭제가 완료되지 않았습니다.'});
      return json(200,{ok:true,source:'netlify_service_role',deleted:count,deleted_items:items.length});
    }

    if(action==='activate'){
      const items=await getItems(id);
      if(!items.length) return json(409,{ok:false,error:'추출된 상품이 없습니다. 상품 검토 후 다시 시도하세요.'});

      const now=new Date().toISOString();
      const region=String(flyer.region||'');
      const businessId=String(flyer.business_id||'');

      if(businessId){
        let q=`weekly_flyers?business_id=eq.${encodeURIComponent(businessId)}&status=eq.active&id=neq.${encodeURIComponent(id)}`;
        if(region) q+=`&region=eq.${encodeURIComponent(region)}`;
        await rest(q,{
          method:'PATCH',
          headers:{Prefer:'return=minimal'},
          body:JSON.stringify({status:'archived',show_on_home:false,updated_at:now})
        });
      }

      const activated=await patchFlyer(id,{status:'active',show_on_home:true,updated_at:now});
      return json(200,{ok:true,source:'netlify_service_role',flyer:activated,item_count:items.length});
    }

  }catch(e){
    console.error('[smart-flyer-admin]',e);
    return json(500,{ok:false,error:e.message||String(e)});
  }
};
