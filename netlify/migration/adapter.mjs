import { withLambda } from '@netlify/aws-lambda-compat';
// HTTP 204/205/304 never carry a body. Legacy handlers use an empty string.
// Keep every business/auth decision in the unchanged legacy handler.
export function adapt(handler) {
  return withLambda(async (event, context) => {
    const result = await handler(event, context);
    if ([204, 205, 304].includes(result.statusCode)) return { ...result, body: null };
    return result;
  });
}
