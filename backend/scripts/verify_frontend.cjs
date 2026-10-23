// Optional cross-language check using the existing compiled frontend contracts.
// Run from project root: node backend/scripts/verify_frontend.cjs <responses.json>
const fs = require('node:fs');
const path = require('node:path');
const schemas = require(path.resolve(__dirname, '../../frontend/.kagami-check/kagami/schemas.js'));
const responses = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const [name, schema] of [
  ['capabilities', schemas.capabilitiesSchema],
  ['wallet', schemas.walletSchema],
  ['decode', schemas.transactionSchema],
  ['preview', schemas.transactionSchema],
]) {
  schema.parse(responses[name]);
  console.log(`Frontend contract accepted: ${name}`);
}
