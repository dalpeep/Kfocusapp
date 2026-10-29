import fs from'node:fs';import{execFileSync}from'node:child_process';
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/);const findings=[];
const rules=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,/sb_secret_[A-Za-z0-9_-]{20,}/,/postgres(?:ql)?:\/\/[^\s/]+:[^\s@]+@/];
for(const p of tracked){if(!fs.existsSync(p)||fs.statSync(p).size>4e6||!fs.statSync(p).isFile()||!/\.(?:js|mjs|cjs|json|html|toml|ya?ml|txt|md|sql|py)$/.test(p))continue;const s=fs.readFileSync(p,'utf8');for(let i=0;i<rules.length;i++)if(rules[i].test(s))findings.push({file:p,rule:i});}
if(findings.length){console.log(JSON.stringify({result:'BLOCKED',findings,valuesPrinted:false}));process.exitCode=1;}else console.log(JSON.stringify({result:'PASS',files:tracked.length,valuesPrinted:false}));
