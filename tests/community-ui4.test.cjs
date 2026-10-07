const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'assets/community.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('UI 4.0 mixed feed keeps six category-specific card paths and no list player',()=>{
  const source=js.slice(js.indexOf('// UI 4.0 keeps'));
  for(const category of ['marketplace','housing','job_hiring','job_seeking','neighborhood','qna'])
    assert.match(source,new RegExp(`category==='${category}'`));
  assert.match(source,/data-community-post/);
  assert.match(source,/▶ 동영상/);
  assert.match(source,/categoryBadge\.textContent=ui4Labels\[current\.category\]/);
  assert.doesNotMatch(source.slice(source.indexOf('card=function'),source.indexOf('const ui4RenderList')),/<iframe|<video|autoplay/);
});

test('UI 4.0 preserves the upload paths and scopes MP4 to marketplace/housing',()=>{
  assert.match(js,/\['marketplace','housing'\]\.includes\(form\.category\.value\)/);
  assert.match(js,/communityVideoRetryForm/);
  assert.match(js,/community-post-create/);
  assert.match(js,/community-post-update/);
  assert.match(js,/community-comment-create/);
  assert.match(js,/community-video-file-input/);
});

test('UI 4.0 uses scrollable chips, sectional form, and versioned assets',()=>{
  assert.match(js,/community-ui41-head/);
  assert.match(js,/<span>커뮤니티<\/span>/);
  assert.doesNotMatch(js.slice(js.indexOf('ensureUI=function(){ui4EnsureUI()')),/우리동네 커뮤니티|구인·구직부터/);
  for(const label of ['기본 정보','상세 정보','사진·영상','연락 및 관리'])assert.ok(js.includes(label));
  assert.match(css,/\.community-category-filters\{display:flex;flex-wrap:nowrap;overflow-x:auto/);
  assert.match(css,/-webkit-line-clamp:2/);
  assert.match(html,/community-owner-actions-v2/g);
});
