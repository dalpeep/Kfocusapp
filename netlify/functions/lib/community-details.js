const FIELDS={
  job_hiring:{required:['business_name','occupation','employment_type','pay','work_area'],optional:['work_hours','deadline']},
  job_seeking:{required:['occupation','experience','preferred_area','employment_type'],optional:['available_from']},
  marketplace:{required:['listing_type','item_name','price','item_condition','trade_area'],optional:['negotiable','external_video_url']},
  neighborhood:{required:['news_type'],optional:['event_date','venue','external_url']},
  qna:{required:['post_type','topic'],optional:['resolved']},
  housing:{required:[],optional:['external_video_url']}
};
const ENUMS={employment_type:['full_time','part_time','contract','other'],listing_type:['sell','buy'],item_condition:['new','like_new','used','other'],news_type:['event','local','notice','other'],post_type:['question','information']};
const fail=()=>{throw Object.assign(new Error('카테고리 추가 정보를 확인해 주세요.'),{status:400})};
function validateDetails(category,input,{legacy=false}={}){
  const spec=FIELDS[category];if(!spec)fail();
  if(typeof input==='string'){try{input=JSON.parse(input)}catch{fail()}}
  if(input==null&&legacy)return null;
  if(!input||typeof input!=='object'||Array.isArray(input))fail();
  const keys=[...spec.required,...spec.optional],out={};
  if(Object.keys(input).some(k=>!keys.includes(k)))fail();
  for(const key of keys){
    if(key==='negotiable'||key==='resolved'){
      if(input[key]!==undefined&&typeof input[key]!=='boolean')fail();
      out[key]=input[key]===true;continue;
    }
    const value=String(input[key]??'').trim();
    if(spec.required.includes(key)&&!value&&!legacy)fail();
    if(value.length>(['external_url','external_video_url'].includes(key)?2048:160))fail();
    if(ENUMS[key]&&value&&!ENUMS[key].includes(value))fail();
    if(['deadline','available_from','event_date'].includes(key)&&value){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)fail();
    }
    if(key==='external_url'&&value){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)fail()}catch{fail()}}
    if(key==='external_video_url'&&value){
      const {validateVideoLink}=require('./community-video-url');
      out[key]=validateVideoLink(value,category).video_url;
      continue;
    }
    if(value)out[key]=value;
  }
  if(category==='marketplace'&&out.price&&!/^(?:\$?\d[\d,.]*|협의)$/.test(out.price))fail();
  return out;
}
module.exports={FIELDS,validateDetails};
