import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const expectedDatabase = 'https://uzxttrkcagvjiehcjfad.supabase.co';
const productionSite = 'aeab4005-52d6-4a5c-ac5a-a5353b289d0d';
const excludedSites = new Set([
  'e2667e40-0999-42a3-892b-2b2edff61434', // Dallas
  '11a5d9d2-43e1-46dc-ae02-b6d5551e5f9c', // Colorado QA
  '90e483b6-6323-483d-9352-8ed923f0f98e', // Shared develop QA
  'ec0bc146-8184-4627-90e0-df82ec2b06f9'  // Owner QA
]);

if (excludedSites.has(process.env.SITE_ID) || (process.env.SITE_ID && process.env.SITE_ID !== productionSite)) {
  throw new Error('This branch is restricted to the independent directory site.');
}
const suppliedUrl = process.env.ONLINE_DIRECTORY_SUPABASE_URL;
if (suppliedUrl && suppliedUrl.replace(/\/$/, '') !== expectedDatabase) {
  throw new Error('Unexpected Online Directory Supabase project URL.');
}
if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DIRECTORY_QA_GATE || process.env.DIRECTORY_QA_PUBLIC_KEY) {
  throw new Error('Shared or QA Supabase configuration is present. Check site environment inheritance.');
}

const output = new URL('public/', root);
await mkdir(output, { recursive: true });
await copyFile(new URL('src/index.html', root), new URL('index.html', output));
await copyFile(new URL('../../assets/kfocus-icon.png', root), new URL('logo.png', output));
await writeFile(new URL('robots.txt', output), 'User-agent: *\nDisallow: /\n');
console.log('Built Online Directory commissioning page. No database connection used.');
