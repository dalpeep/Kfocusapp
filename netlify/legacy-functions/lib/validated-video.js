'use strict';
const VIDEO_LIMIT=50*1024*1024;
function validateVideo(bytes,declaredSize){
 if(!Buffer.isBuffer(bytes)||!Number.isInteger(declaredSize)||bytes.length!==declaredSize||bytes.length<24||bytes.length>VIDEO_LIMIT)throw Error('VIDEO_SIZE_INVALID');
 let offset=0,ftyp=false,media=false;
 while(offset<bytes.length){if(bytes.length-offset<8)throw Error('VIDEO_CONTAINER_INVALID');let size=bytes.readUInt32BE(offset),header=8;const type=bytes.toString('ascii',offset+4,offset+8);if(size===1){if(bytes.length-offset<16)throw Error('VIDEO_CONTAINER_INVALID');const n=bytes.readBigUInt64BE(offset+8);if(n>BigInt(VIDEO_LIMIT))throw Error('VIDEO_CONTAINER_INVALID');size=Number(n);header=16;}else if(size===0)size=bytes.length-offset;
  if(size<header||size>bytes.length-offset)throw Error('VIDEO_CONTAINER_INVALID');
  if(type==='ftyp'){if(offset!==0||size<header+8)throw Error('VIDEO_CONTAINER_INVALID');const brands=bytes.toString('ascii',offset+header,offset+size);if(!/(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV)/.test(brands))throw Error('VIDEO_CONTAINER_INVALID');ftyp=true;}
  if(type==='moov'||type==='moof')media=true;offset+=size;
 }
 if(!ftyp||!media)throw Error('VIDEO_CONTAINER_INVALID');return bytes;
}
module.exports={validateVideo,VIDEO_LIMIT};
