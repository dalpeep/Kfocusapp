const { assertTestPreview } = require('../netlify/functions/lib/test-preview-guard');
if (!assertTestPreview(require('./preview-build-env.cjs')(process.env),{requireService:false})) throw new Error('TEST_PREVIEW_MODE=true is required for the Test Site build.');
console.log('Test Preview identity: verified');
