'use strict';

// Returns null when the path is safe to write, or a short reason when it is not.
// These rules stop the bot (or a bad instruction) from touching secrets,
// git internals, deployment workflows, or the domain file.
function validatePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) {
    return 'invalid path';
  }
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return 'invalid path';
  }

  const parts = path.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    return 'invalid path';
  }

  const first = parts[0].toLowerCase();
  if (first === '.git' || first === '.github') return 'protected folder';
  if (parts.includes('node_modules')) return 'protected folder';
  if (parts.some((part) => /^\.env/i.test(part))) return 'protected file';
  if (path === 'CNAME') return 'protected file (controls your domain)';

  return null;
}

module.exports = { validatePath };
