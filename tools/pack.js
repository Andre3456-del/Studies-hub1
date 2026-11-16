// node tools/pack.js : bundle every valid draft in work/ into out/results-<date>.zip for the owner to upload on the Study bot page.
// Drafts that cannot be used yet (needs-better-file, or invalid) are listed, left in work/, and also included so the owner can see why.
const fs = require('fs'), path = require('path'), zip = require('./zip'), L = require('./lib'), { check } = require('./validate');
const items = [], notes = [];
for (const id of L.ids('work')) {
  const d = L.readJson(path.join(L.dir('work'), id + '.json')), errs = check(d);
  if (errs.length && d.status !== 'needs-better-file') { notes.push(`${id}: ${errs.join('; ')}`); continue; }
  items.push(d);
}
if (!items.length) { console.error('Nothing to pack.' + (notes.length ? '\n' + notes.join('\n') : '')); process.exit(1); }
const name = `results-${new Date().toISOString().slice(0, 10)}.zip`;
fs.mkdirSync(L.dir('out'), { recursive: true });
fs.writeFileSync(path.join(L.dir('out'), name), zip.write([{ name: 'results.json', data: Buffer.from(JSON.stringify({ version: 1, created: new Date().toISOString(), items }, null, 2)) }]));
L.log(`pack: ${items.length} item(s) in out/${name}${notes.length ? `, ${notes.length} left out` : ''}`);
console.log(`out/${name}: ${items.length} item(s)` + (notes.length ? `\nLeft out:\n${notes.join('\n')}` : ''));
