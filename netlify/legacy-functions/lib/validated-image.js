'use strict';
const sharp=require('sharp');
const LIMIT=5242880;
const formats={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'};
function sniff(b){
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'jpeg';
 if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'webp';
 return null;
}
async function validateImage(bytes,mime,name){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>LIMIT)throw Error('IMAGE_SIZE_INVALID');
 const format=sniff(bytes),ext=String(name).split('.').pop().toLowerCase();
 if(!format||formats[format]!==mime||!(format==='jpeg'?['jpg','jpeg']: [format]).includes(ext))throw Error('IMAGE_FORMAT_MISMATCH');
 try{
  const image=sharp(bytes,{failOn:'warning',limitInputPixels:16000000,limitInputChannels:4});
  const meta=await image.metadata();
  if(meta.format!==format||!meta.width||!meta.height||meta.width>8000||meta.height>8000||(meta.pages||1)>1)throw Error('bad metadata');
  // Full pixel decode + canonical re-encode, strips untrusted metadata/trailing payload.
  const output=await image.rotate().toFormat(format,format==='png'?{compressionLevel:9}:{}).toBuffer();
  if(output.length>LIMIT)throw Error('output too large');
  return {bytes:output,mime:formats[format],format,width:meta.width,height:meta.height};
 }catch{throw Error('IMAGE_DECODE_FAILED');}
}
module.exports={validateImage,LIMIT};
