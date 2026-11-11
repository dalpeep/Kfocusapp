import fs from'node:fs';import{verify}from'./verify-preservation.mjs';import{execFileSync}from'node:child_process';
const p=JSON.parse(fs.readFileSync('release-baseline/activation.json'));if(process.env.CONTEXT==='production'?!p.gitProductionEnabled:!p.stagingGitBuildEnabled)throw Error('GIT_BUILD_TRANSITION_NOT_APPROVED');
verify();
// Preserve the original build command after an explicit, reviewed activation.
execFileSync(process.execPath,['scripts/generate-seo.js'],{stdio:'inherit'});
