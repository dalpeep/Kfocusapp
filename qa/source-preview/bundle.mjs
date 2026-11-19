import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {zipFunctions} from '@netlify/zip-it-and-ship-it';

const output = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'daltownmap-qa-'));
const includedFiles = ['node_modules/@supabase/**', 'node_modules/iceberg-js/**', 'node_modules/tslib/**'];
const functions = await zipFunctions('qa/source-preview/functions', output, {
  basePath: process.cwd(), archiveFormat: 'zip',
  config: {
    'community-admin': {includedFiles},
    'community-post-create': {includedFiles},
    'owner-portal-uuid': {includedFiles},
  },
});
assert.deepEqual(functions.map(fn => fn.name).sort(),
  ['community-admin', 'community-post-create', 'config', 'owner-portal-uuid', 'today-daltown-feed']);
assert.ok(functions.every(fn => fn.runtimeAPIVersion === 2 && !fn.schedule));
console.log('QA Functions built from source: ' + functions.map(fn => fn.name).sort().join(', '));
