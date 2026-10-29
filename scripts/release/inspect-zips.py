import zipfile, pathlib, json, hashlib, re
root=pathlib.Path('.release-artifacts/functions'); output=pathlib.Path('.release-artifacts/unpacked')
targets={'coupon-campaign-enter','coupon-campaign-admin','coupon-used-notify','event-winner-admin','community-post-create','community-comment-create','newsroom-daily','collect-newsroom','generate-content-suite','ai-daily-home'}
rows=[]
for file in sorted(root.glob('*.zip')):
    with zipfile.ZipFile(file) as z:
        assert z.testzip() is None, 'ZIP_CRC_FAILED'
        for name in z.namelist():
            p=pathlib.PurePosixPath(name)
            assert not p.is_absolute() and '..' not in p.parts, 'ZIP_PATH_FAILED'
            assert not any(x=='.env' or x.startswith('.env.') for x in p.parts), 'ENV_FILE_IN_BUNDLE'
            if name.endswith(('.js','.mjs','.cjs','.json')):
                body=z.read(name).decode('utf-8',errors='replace')
                assert not re.search(r'sb_secret_[A-Za-z0-9_-]{20,}',body), 'SECRET_LITERAL_IN_BUNDLE'
                assert not re.search(r'postgres(?:ql)?://[^\s/]+:[^\s@]+@',body), 'DB_CREDENTIAL_IN_BUNDLE'
        if file.stem in targets: z.extractall(output/file.stem)
        rows.append({'name':file.stem,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'entries':len(z.namelist())})
assert len(rows)==49, 'ZIP_COUNT_FAILED'
pathlib.Path('.release-artifacts/zip-integrity.json').write_text(json.dumps({'result':'PASS','bundles':49,'crcPassed':49,'secretFindings':0,'rows':rows},indent=2))
print(json.dumps({'result':'PASS','zipBundles':49,'crcPass':49,'secretFindings':0}))
