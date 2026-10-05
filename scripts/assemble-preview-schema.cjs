const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'../supabase');
const target=path.join(base,'owner-phase1b-test/06-preview-schema.sql');
const files=['community-phase1.sql','community-image-edit-phase1.sql','community-video-link-phase1.sql','community-board-phase3.sql','community-hidden-moderation-phase1.sql','community-cleanup-contract-phase1.sql','community-retention-extension-preview.sql','event-winner-coupon-phase1.sql','business-specials-phase1.sql','business-special-items-phase1.sql'];
let source=fs.readFileSync(target,'utf8').split('-- BEGIN CANONICAL PREVIEW DEPENDENCIES')[0];
source=source.replace(/commit;\s*-- After this file succeeds,[\s\S]*$/,'');
source += '\n-- BEGIN CANONICAL PREVIEW DEPENDENCIES\n';
for(const file of files){
  let sql=fs.readFileSync(path.join(base,file),'utf8').replace(/^\s*(begin|commit);\s*$/gmi,'');
  // CREATE TABLE IF NOT EXISTS skips constraints on the minimal baseline table.
  if(file==='community-cleanup-contract-phase1.sql')sql=sql.replace('drop constraint community_marketplace_expiry_check','drop constraint if exists community_marketplace_expiry_check');
  source += `\n-- BEGIN SOURCE ${file}\n${sql.trim()}\n-- END SOURCE ${file}\n`;
}
source += '\n-- Service Functions own writes; public access is through the canonical read RPCs.\ngrant select,insert,update,delete on public.community_posts,public.community_post_images,public.community_comments,public.community_upload_drafts,public.community_rate_limits,public.community_image_edit_requests,public.community_image_cleanup_queue to service_role;\nupdate public.owner_test_preview_state set phase=\'schema\' where id=true;\nnotify pgrst, \'reload schema\';\ncommit;\n';
fs.writeFileSync(target,source);
