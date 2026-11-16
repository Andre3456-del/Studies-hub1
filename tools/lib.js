// Shared helpers for the bot tools (plain Node, no packages).
const fs = require('fs'), path = require('path');
exports.root = path.join(__dirname, '..');
exports.dir = n => path.join(exports.root, n);
exports.readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
exports.writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
exports.ids = d => fs.existsSync(exports.dir(d)) ? fs.readdirSync(exports.dir(d)).filter(n => /^\d+\.json$/.test(n)).map(n => n.replace('.json', '')) : [];
exports.log = line => fs.appendFileSync(path.join(exports.root, 'log.md'), `\n(${new Date().toISOString().slice(0, 16).replace('T', ' ')}) ${line}\n`);
exports.KINDS = ['past-question', 'lecture-note', 'test', 'other'];
