import fs from 'node:fs';
export function bundlingConfig() {
 const text=fs.readFileSync('netlify.toml','utf8').replaceAll('\r\n','\n');
 const block=text.split('[functions]\n')[1]?.split('\n[')[0];
 const includedFiles=JSON.parse(block?.match(/included_files\s*=\s*(\[[^\]]+\])/)?.[1]??'null');
 const expected=['node_modules/@supabase/**','node_modules/@netlify/aws-lambda-compat/**','node_modules/@netlify/types/**','node_modules/iceberg-js/**','node_modules/tslib/**'];
 if(JSON.stringify(includedFiles)!==JSON.stringify(expected))throw Error('UNREVIEWED_FUNCTION_PACKAGING_CONFIG');
 const imageFiles=["node_modules/@supabase/**","node_modules/@netlify/aws-lambda-compat/**","node_modules/@netlify/types/**","node_modules/iceberg-js/**","node_modules/tslib/**","node_modules/sharp/**","node_modules/@img/**","node_modules/detect-libc/**","node_modules/semver/**","node_modules/@emnapi/**","netlify/legacy-functions/lib/fonts/**","netlify/legacy-functions/lib/owner-coupon-template.js","netlify/legacy-functions/lib/validated-image.js"];
 const config={'*':{nodeVersion:'22.x',includedFiles}};
 for(const name of ['owner-content-uuid','owner-image-uuid']){const block=text.split('[functions."'+name+'"]')[1]?.split('\n[')[0];const files=JSON.parse(block?.match(/included_files\s*=\s*(\[[^\]]+\])/)?.[1]??'null');if(JSON.stringify(files)!==JSON.stringify(imageFiles))throw Error('OWNER_IMAGE_PACKAGING_CHANGED');config[name]={nodeVersion:'22.x',includedFiles:files};}return config;
}
