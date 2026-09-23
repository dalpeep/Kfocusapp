const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const community=fs.readFileSync(path.join(root,'assets/community.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('post delete opens a dedicated in-page password and Turnstile form',()=>{
  const deleteForm=community.slice(community.indexOf('function openPostDelete()'),community.indexOf('detailClick=async function'));
  assert.match(deleteForm,/id="communityPostDeleteForm"/);
  assert.match(deleteForm,/name="password" type="password"/);
  assert.match(deleteForm,/\$\{turnstileBox\(\)\}/);
  assert.match(deleteForm,/renderTurnstile\(body\)/);
  assert.match(deleteForm,/api\('community-post-delete',\{id:postId,password:form\.elements\.password\.value,turnstile_token:token\(\)\}\)/);
  assert.doesNotMatch(deleteForm,/prompt\(/);
});

test('post delete button is separate from comment password and update/share paths',()=>{
  const activeHandler=community.slice(community.indexOf('detailClick=async function'));
  assert.match(activeHandler,/owner\.dataset\.ownerAction==='delete'\)return openPostDelete\(\)/);
  assert.match(activeHandler,/owner\.dataset\.ownerAction==='update'\)return openWrite/);
  assert.match(activeHandler,/data-comment-delete/);
  assert.match(activeHandler,/data-community-share/);
  assert.match(html,/community\.js\?v=community-post-delete-form-1/);
});
