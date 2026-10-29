import fs from 'node:fs';
export function bundlingConfig() {
 const text=fs.readFileSync('netlify.toml','utf8').replaceAll('\r\n','\n');
 const block=text.split('[functions]\n')[1]?.split('\n[')[0];
 const includedFiles=JSON.parse(block?.match(/included_files\s*=\s*(\[[^\]]+\])/)?.[1]??'null');
 const expected=['node_modules/@supabase/**','node_modules/@netlify/aws-lambda-compat/**','node_modules/@netlify/types/**','node_modules/iceberg-js/**','node_modules/tslib/**'];
 if(JSON.stringify(includedFiles)!==JSON.stringify(expected))throw Error('UNREVIEWED_FUNCTION_PACKAGING_CONFIG');
 return {'*':{nodeVersion:'22.x',includedFiles}};
}
