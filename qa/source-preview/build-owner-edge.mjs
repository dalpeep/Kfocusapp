import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

await build({
  entryPoints: [fileURLToPath(new URL('./owner-edge.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('../../supabase/functions/owner-phase1-qa/handler.generated.mjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['@supabase/supabase-js'],
});
