'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {SITE_ID, SUPABASE_URL, requireTarget} = require('./target.cjs');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.qa-source-public');
const isPreview = env => env.SITE_ID === SITE_ID && env.CONTEXT === 'deploy-preview';
if (process.argv[2] === '--ignore') process.exit(isPreview(process.env) ? 1 : 0);
if (process.env.NETLIFY === 'true') {
  if (!isPreview(process.env)) throw Error('UUID_QA_DEPLOY_PREVIEW_REQUIRED');
  requireTarget(process.env);
}

const topLevel = new Set([
  'index.html', 'styles.css', 'app-v99.js', 'main-banners.js', 'v115-home-section-controls.js',
  'business-index.json', 'seo-index.json', 'manifest.json', 'privacy.html', 'seo.html',
]);
const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0');
const paths = [...new Set(tracked.filter(file => topLevel.has(file) ||
  /^(assets|icons|owner-uuid)\/[\w./-]+\.(?:js|css|html|png|jpe?g|webp|svg|ico|woff2?)$/i.test(file)))];
for (const file of topLevel) {
  if (!paths.includes(file)) throw Error('MISSING_QA_STATIC_SOURCE: ' + file);
}
for (const file of paths) {
  if (!fs.lstatSync(path.join(root, file)).isFile()) throw Error('INVALID_QA_STATIC_SOURCE: ' + file);
}

if (fs.existsSync(output)) {
  if (fs.realpathSync(output) !== fs.realpathSync(root) + path.sep + '.qa-source-public' ||
      !fs.existsSync(path.join(output, '.qa-build-output'))) throw Error('QA_OUTPUT_SCOPE');
  fs.rmSync(output, {recursive: true});
}
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, '.qa-build-output'), '');
for (const file of paths) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(root, file), destination);
}

const csp = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
  "form-action 'none'", "worker-src 'none'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://maps.googleapis.com https://maps.gstatic.com https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: " + SUPABASE_URL + "/storage/v1/object/public/ https://maps.googleapis.com https://maps.gstatic.com",
  "connect-src 'self' " + SUPABASE_URL + "/rest/v1/ https://maps.googleapis.com https://maps.gstatic.com",
].join('; ');
fs.writeFileSync(path.join(output, '_headers'),
  '/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  Content-Security-Policy: ' + csp + '\n');
fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.appendFileSync(path.join(output, 'styles.css'),
  '\n#communityModal label:has(input[type="file"]), #communityModal input[type="file"] { display: none; }\n');
console.log('QA static files: ' + paths.length + ' | Supabase: ' + SUPABASE_URL);
