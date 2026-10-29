'use strict';
const crypto=require('node:crypto');
const DESIGNS={percent:['할인형','#174ea6'],gift:['무료 증정형','#146b55'],amount:['금액 할인형','#903e22'],special:['특별 혜택형','#663c96']};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
async function renderPng(design,c){
 const sharp=require('sharp'),path=require('node:path'),fs=require('node:fs');
 const fontfile=[path.join(__dirname,'fonts/NotoSansKR.ttf'),path.join(process.cwd(),'netlify/functions/lib/fonts/NotoSansKR.ttf')].find(p=>fs.existsSync(p));
 if(!fontfile)throw Error('TEMPLATE_FONT_MISSING');
 const format=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const blocks=[['DALTOWNMAP · '+DESIGNS[design][0],40,28,60],[c.title,115,46,130],[c.discount_label,270,50,140],[format(c.start_at)+' ~ '+format(c.end_at)+' (댈러스)',465,22,60],[c.description||' ',545,22,70]],overlays=[];
 for(const [value,top,size,height]of blocks){if(!String(value??'').trim())continue;let b=await sharp({text:{text:'<span foreground="white">'+escape([...String(value)].slice(0,180).join(''))+'</span>',font:'Noto Sans KR '+size,fontfile,width:890,rgba:true,dpi:72,wrap:'word-char'}}).png().toBuffer();const m=await sharp(b).metadata();if(m.height>height)b=await sharp(b).resize({width:890,height,fit:'inside'}).png().toBuffer();overlays.push({input:b,left:55,top});}
 return sharp({create:{width:1000,height:650,channels:4,background:DESIGNS[design][1]}}).composite(overlays).png().toBuffer();
}
async function prepareCoupon(db,actor,command){
 const {data:policy,error}=await db.rpc('owner_coupon_policy',{p_actor:actor,p_business:command.business_id});
 if(error||!policy)throw Object.assign(Error('쿠폰 이용 권한을 확인해 주세요.'),{status:403});
 const changes=command.changes;
 if(policy.custom_image===true&&!changes.template_design)return command;
 if(!policy.custom_image&&(changes.delivery_mode==='raffle'||changes.marketing_opt_in_enabled===true||changes.one_per_email===false))throw Object.assign(Error('무료 쿠폰은 기본 이메일 발급과 중복 방지를 사용합니다.'),{status:403});
 if(!Object.hasOwn(DESIGNS,changes.template_design||''))throw Object.assign(Error('무료 쿠폰은 기본 디자인 4종을 사용해 주세요.'),{status:403});
 // Authorize and read current values before generating or uploading any image.
 const read=await db.rpc('owner_content_read',{p_actor:actor,p_business:command.business_id});
 if(read.error)throw Object.assign(Error('이 업소의 관리 권한이 없습니다.'),{status:403});
 const previous=command.record_id?(read.data.coupons||[]).find(x=>String(x.id)===command.record_id):{};
 if(!previous)throw Object.assign(Error('쿠폰을 찾을 수 없습니다.'),{status:403});
 if(previous.delivery_mode==='raffle'&&!policy.raffle)throw Object.assign(Error('기존 추첨 캠페인은 관리자에게 문의해 주세요.'),{status:403});
 const effective={...previous,...changes};
 if(!effective.title?.trim()||!effective.discount_label?.trim()||!effective.start_at||!effective.end_at||!Number.isFinite(Date.parse(effective.start_at))||!Number.isFinite(Date.parse(effective.end_at))||Date.parse(effective.end_at)<=Date.parse(effective.start_at))throw Object.assign(Error('쿠폰 제목·혜택·시작일·종료일을 확인해 주세요.'),{status:400});
 const bytes=await renderPng(changes.template_design,effective);
 const path=`coupon-templates/${command.business_id}/${actor}/${command.key}.png`;
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const prior=await db.rpc('owner_coupon_template_lookup',{p_actor:actor,p_business:command.business_id,p_path:path});
 if(prior.error)throw Error('TEMPLATE_LOOKUP_FAILED');
 if(prior.data){if(prior.data.sha256!==sha)throw Object.assign(Error('같은 요청 번호로 다른 내용을 저장할 수 없습니다.'),{status:409});return {...command,changes:{...changes,image_url:prior.data.url,...(!policy.custom_image?{delivery_mode:'instant_email',one_per_email:true,marketing_opt_in_enabled:false}:{})}};}

 const store=db.storage.from('public-images');
 const saved=await store.upload(path,bytes,{contentType:'image/png',upsert:false,metadata:{generated_by:'owner-coupon-template'}});
 if(saved.error)throw Error('TEMPLATE_STORAGE_FAILED');
 const url=store.getPublicUrl(path).data.publicUrl;
 const registered=await db.rpc('owner_coupon_template_register',{p_actor:actor,p_business:command.business_id,p_path:path,p_url:url,p_design:changes.template_design,p_sha256:sha});
 if(registered.error)throw Error('TEMPLATE_REGISTRATION_FAILED');
 return {...command,changes:{...changes,image_url:url,...(!policy.custom_image?{delivery_mode:'instant_email',one_per_email:true,marketing_opt_in_enabled:false}:{})}};
}
module.exports={DESIGNS,renderPng,prepareCoupon};
