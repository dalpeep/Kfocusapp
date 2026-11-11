import {makeEdgeHandler} from './handler.generated.mjs';

Deno.serve(makeEdgeHandler({
  projectUrl: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
