// node tools/validate.js : check every draft in work/ has the right shape (docs/FORMATS.md). The site checks again on import.
const L = require('./lib'), path = require('path');
exports.check = d => {
  const e = [];
  if (!['upload', 'draft-from-knowledge'].includes(d.source)) e.push('source must be upload or draft-from-knowledge');
  if (d.status === 'needs-better-file') { if (!d.notes) e.push('needs-better-file requires notes'); return e; }
  if (d.status !== 'ready') e.push('status must be ready or needs-better-file');
  if (d.source === 'upload' && (!Array.isArray(d.source_ids) || !d.source_ids.length || !d.source_ids.every(Number.isInteger))) e.push('upload items need source_ids (the upload ids from the batch)');
  if (!d.course || !d.course.code || !d.course.title) e.push('course.code and course.title are required');
  if (!Number.isInteger(d.level) || d.level < 100 || d.level > 700) e.push('level must be a number like 200');
  if (!d.topic) e.push('topic is required');
  if (!L.KINDS.includes(d.kind)) e.push('kind must be one of ' + L.KINDS.join(', '));
  if (!Array.isArray(d.summary) || !d.summary.length) e.push('summary needs at least 1 line');
  if (!Array.isArray(d.questions)) e.push('questions must be a list (it may be empty)');
  (d.questions || []).forEach((q, i) => {
    const t = 'question ' + (i + 1) + ': ';
    if (!q.q || !String(q.q).trim()) e.push(t + 'empty question');
    if (!Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options.map(String)).size !== 4) e.push(t + 'needs exactly 4 different options');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e.push(t + 'answer must be 0 to 3');
    if (!q.explain) e.push(t + 'explain is required');
  });
  return e;
};
if (require.main === module) {
  let bad = 0;
  for (const id of L.ids('work')) {
    const errs = exports.check(L.readJson(path.join(L.dir('work'), id + '.json')));
    if (errs.length) { bad++; console.log('✗ ' + id + '\n  ' + errs.join('\n  ')); } else console.log('✓ ' + id);
  }
  console.log(bad ? bad + ' draft(s) need fixing' : 'All drafts are valid');
  process.exit(bad ? 1 : 0);
}
