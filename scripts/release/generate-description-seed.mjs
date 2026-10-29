import fs from'node:fs';import{createHash}from'node:crypto';
const file='supabase/owner-open/data/description-catalog.json',source=fs.readFileSync(file),catalog=JSON.parse(source),q=v=>"'"+String(v).replaceAll("'","''")+"'",ids=new Set();
if(catalog.version!==1||!Array.isArray(catalog.groups)||!catalog.groups.some(g=>g.key==='general'))throw Error('CATALOG_SCHEMA');
const categories=[],options=[];
for(const [i,g]of catalog.groups.entries()){
 if(!/^[a-z-]{2,40}$/.test(g.key)||!g.label_ko||!g.label_en||!Array.isArray(g.terms)||!g.options.length)throw Error('CATEGORY_SCHEMA');
 categories.push(`(${q(g.key)},${q(g.label_ko)},${q(g.label_en)},ARRAY[${g.terms.map(q).join(',')}]::text[],${i})`);
 for(const [j,o]of g.options.entries())for(const locale of ['ko','en']){
  const id=`${g.key}-${o.key}-${locale}`;if(ids.has(id)||typeof o[locale]!=='string'||!o[locale].trim()||o[locale].length>500)throw Error('OPTION_SCHEMA');ids.add(id);
  options.push(`(${q(id)},${q(o[locale])},true,${i*100+j*2+(locale==='en'?1:0)},${q(g.key)},${q(locale)})`);
 }
}
const text=`-- Generated from ${file}; SHA256 ${createHash('sha256').update(source).digest('hex')}\n-- REVIEW ONLY. Never overwrites existing catalog edits or business descriptions.\nBEGIN;\nDO $$ BEGIN IF current_user<>'postgres' OR current_setting('owner_preview.descriptions_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate introduction seed approval required'; END IF;IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Project mismatch'; END IF;END $$;\nINSERT INTO owner_portal_uuid_internal.description_categories(key,label_ko,label_en,terms,sort_order) VALUES\n${categories.join(',\n')}\nON CONFLICT(key) DO NOTHING;\nINSERT INTO owner_portal_uuid_internal.description_options(id,phrase,active,sort_order,category_key,locale) VALUES\n${options.join(',\n')}\nON CONFLICT(id) DO NOTHING;\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n`;
const path='supabase/owner-open/12-owner-description-seed.sql';
if(process.argv.includes('--check')){if(fs.readFileSync(path,'utf8').replaceAll('\r\n','\n')!==text)throw Error('SEED_DRIFT');}else fs.writeFileSync(path,text);
console.log(JSON.stringify({result:'PASS',categories:categories.length,options:options.length,languages:['ko','en'],applied:false}));
