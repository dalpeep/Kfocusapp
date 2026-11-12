import {build} from 'esbuild';

await build({
  entryPoints: ['supabase/owner-phase1-source/owner-edge.mjs'],
  outfile: 'supabase/functions/owner-phase1/handler.generated.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['@supabase/supabase-js', './owner-entitlement-policy'],
});
