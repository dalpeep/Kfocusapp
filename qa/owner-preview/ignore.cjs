'use strict';
// Netlify ignore: 1 = run only the explicitly pinned QA Preview; 0 = ignore.
try{require('./canary-build.cjs').preflight(process.env);process.exitCode=1;}catch{process.exitCode=0;}
