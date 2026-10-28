'use strict';

const API = 'https://api.github.com';
const MAX_READ_BYTES = 200_000;

function createGithub({ token, repo, branch }) {
  async function request(method, path, body) {
    const res = await fetch(`${API}/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'studies-hub-bot',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const reason = (data && data.message) || text || 'unknown error';
      throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${reason}`);
    }
    return data;
  }

  async function listFiles() {
    const data = await request('GET', `/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    return data.tree
      .filter((entry) => entry.type === 'blob')
      .map((entry) => ({ path: entry.path, size: entry.size }));
  }

  async function readFile(path) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const data = await request('GET', `/contents/${encoded}?ref=${encodeURIComponent(branch)}`);
    if (Array.isArray(data) || data.type !== 'file') throw new Error('Not a file');
    if (data.size > MAX_READ_BYTES) throw new Error('File is too large to read');
    return Buffer.from(data.content, 'base64').toString('utf8');
  }

  // Commits every change in one commit. changes: [{ path, action, content }]
  async function commitChanges(changes, message) {
    const ref = await request('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
    const parentSha = ref.object.sha;
    const parent = await request('GET', `/git/commits/${parentSha}`);

    const tree = [];
    for (const change of changes) {
      if (change.action === 'delete') {
        tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      } else {
        const blob = await request('POST', '/git/blobs', {
          content: change.content,
          encoding: 'utf-8',
        });
        tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
    }

    const newTree = await request('POST', '/git/trees', {
      base_tree: parent.tree.sha,
      tree,
    });
    const commit = await request('POST', '/git/commits', {
      message,
      tree: newTree.sha,
      parents: [parentSha],
    });
    await request('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, {
      sha: commit.sha,
    });

    return `https://github.com/${repo}/commit/${commit.sha}`;
  }

  return { listFiles, readFile, commitChanges };
}

module.exports = { createGithub };
