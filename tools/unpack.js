// node tools/unpack.js <batch.zip>
// Unpack the batch zip downloaded from the Studies Hub "Study bot" page: batch.json -> inbox/<id>.json, files -> inbox/files/.
const fs = require('fs'), path = require('path'), zip = require('./zip'), L = require('./lib');
const f = process.argv[2];
if (!f || !fs.existsSync(f)) { console.error('Usage: node tools/unpack.js <batch.zip>'); process.exit(1); }
const entries = zip.read(fs.readFileSync(f)), b = entries.find(e => e.name === 'batch.json');
if (!b) { console.error('No batch.json in that zip. Is it the batch from the Study bot page?'); process.exit(1); }
const batch = JSON.parse(b.data.toString('utf8'));
fs.mkdirSync(path.join(L.dir('inbox'), 'files'), { recursive: true });
let n = 0;
for (const it of batch.items) {
  const e = entries.find(x => x.name === it.file);
  if (!e) { console.error('Missing file for', it.id); continue; }
  fs.writeFileSync(path.join(L.dir('inbox'), 'files', path.basename(it.file)), e.data);
  L.writeJson(path.join(L.dir('inbox'), it.id + '.json'), Object.assign({}, it, { file: 'files/' + path.basename(it.file) }));
  n++;
}
fs.copyFileSync(f, path.join(L.dir('batches'), path.basename(f)));
L.log(`unpack: ${n} upload(s) from ${path.basename(f)} (part ${batch.part || 1} of ${batch.parts || 1})`);
console.log(`${n} upload(s) are in inbox/. Read each one and write work/<id>.json (see docs/FORMATS.md).`);
