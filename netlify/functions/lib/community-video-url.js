const VIDEO_CATEGORIES=new Set(['marketplace','housing']);
const VIDEO_PROVIDERS=new Set(['youtube','instagram','facebook']);
const YOUTUBE_ID=/^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_CODE=/^[A-Za-z0-9_-]{5,100}$/;
const FACEBOOK_ID=/^[A-Za-z0-9_.-]{3,100}$/;

function invalid(){throw Object.assign(new Error('올바른 YouTube, Instagram 또는 Facebook 영상 링크를 입력해 주세요.'),{status:400})}

function validateVideoLink(value,category){
  // A category change deliberately discards a previously entered video link.
  if(!VIDEO_CATEGORIES.has(category))return{video_url:null,video_provider:null};
  const raw=String(value??'').trim();
  if(!raw)return{video_url:null,video_provider:null};
  if(raw.length>2048||!/^https:\/\//i.test(raw)||/[<>\u0000-\u001f\u007f]/.test(raw))invalid();
  let url;try{url=new URL(raw)}catch{invalid()}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)invalid();
  const host=url.hostname.toLowerCase(),path=url.pathname;
  if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)){
    let id=null;
    if(host==='youtu.be')id=path.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    else if(path==='/watch')id=url.searchParams.get('v');
    else id=path.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    if(!id||!YOUTUBE_ID.test(id))invalid();
    return{video_url:`https://www.youtube.com/watch?v=${id}`,video_provider:'youtube'};
  }
  if(['instagram.com','www.instagram.com'].includes(host)){
    const match=path.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,100})\/?$/);
    if(!match||!INSTAGRAM_CODE.test(match[2]))invalid();
    return{video_url:`https://www.instagram.com/${match[1]}/${match[2]}/`,video_provider:'instagram'};
  }
  if(['facebook.com','www.facebook.com','m.facebook.com'].includes(host)){
    let canonical=null;
    if(/^\/watch\/?$/.test(path)){
      const id=url.searchParams.get('v');
      if(id&&FACEBOOK_ID.test(id))canonical=`https://www.facebook.com/watch/?v=${encodeURIComponent(id)}`;
    }else{
      const reel=path.match(/^\/reel\/([A-Za-z0-9_.-]{3,100})\/?$/);
      const video=path.match(/^\/(?:[A-Za-z0-9_.-]+\/)?videos\/([A-Za-z0-9_.-]{3,100})\/?$/);
      const post=path.match(/^\/([A-Za-z0-9_.-]+)\/posts\/([A-Za-z0-9_.-]{3,100})\/?$/);
      if(reel)canonical=`https://www.facebook.com/reel/${reel[1]}/`;
      else if(video)canonical=`https://www.facebook.com${video[0].endsWith('/')?video[0]:`${video[0]}/`}`;
      else if(post)canonical=`https://www.facebook.com/${post[1]}/posts/${post[2]}/`;
    }
    if(!canonical)invalid();
    return{video_url:canonical,video_provider:'facebook'};
  }
  invalid();
}

module.exports={VIDEO_CATEGORIES,VIDEO_PROVIDERS,validateVideoLink};
