const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('production schedules preserve raffle and newsroom with one Daily Core authority',()=>{
  const toml=read('netlify.toml');
  const newsroom=read('netlify/functions/newsroom-daily.js');
  const refresh=read('netlify/functions/daily-core-refresh.js');
  const scheduled=read('netlify/functions/daily-core-scheduled.mjs');
  const all=[toml,newsroom,refresh,scheduled].join('\n');

  assert.match(toml,/\[functions\."raffle-auto-draw"\]\s+schedule\s*=\s*"\*\/10 \* \* \* \*"/);
  assert.match(newsroom,/exports\.config\s*=\s*\{\s*schedule:\s*'0 11 \* \* \*'\s*\}/);
  assert.match(scheduled,/export const config\s*=\s*\{\s*schedule:\s*'15 11 \* \* \*'\s*\}/);
  assert.doesNotMatch(toml,/daily-core-refresh/);
  assert.doesNotMatch(refresh,/exports\.config|15 11 \* \* \*/);
  assert.equal((all.match(/15 11 \* \* \*/g)||[]).length,1);
});

test('production merge contains no isolated staging schema or synthetic fixture',()=>{
  for(const relative of ['supabase/staging-phase1b-schema.sql','supabase/staging-phase1b-fixtures.sql']){
    assert.equal(fs.existsSync(path.join(root,relative)),false,relative);
  }
  const runtimeFiles=[
    'netlify.toml',
    'netlify/functions/daily-core-refresh.js',
    'netlify/functions/daily-core-scheduled.mjs',
    'netlify/functions/lib/daily-core.js'
  ];
  for(const relative of runtimeFiles){
    assert.doesNotMatch(read(relative),/comforting-shortbread|staging-phase1b|staging-gen-|DAILY_CORE_SCHEDULE_REGION/);
  }
});
