'use strict';

const { validatePath } = require('./paths');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TURNS = 10;
const MAX_FILES_IN_PROMPT = 300;

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the current contents of a file in the website repository.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path, e.g. index.html' } },
      required: ['path'],
    },
  },
  {
    name: 'propose_changes',
    description:
      'Propose the final set of file changes for the owner to approve. Nothing is published until the owner approves. Always give the COMPLETE content of every created or updated file.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Plain-language summary of what will change, 1 to 3 short sentences.',
        },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              action: { type: 'string', enum: ['create', 'update', 'delete'] },
              content: {
                type: 'string',
                description: 'Full file content. Omit for delete.',
              },
            },
            required: ['path', 'action'],
          },
        },
      },
      required: ['summary', 'changes'],
    },
  },
];

function buildSystemPrompt(siteUrl, files) {
  const list = files
    .slice(0, MAX_FILES_IN_PROMPT)
    .map((file) => file.path)
    .join('\n');
  const more = files.length > MAX_FILES_IN_PROMPT ? `\n(+${files.length - MAX_FILES_IN_PROMPT} more files)` : '';

  return `You are the website assistant for ${siteUrl}. The owner messages you on WhatsApp and you create or edit the site's files. The site is a static website hosted on GitHub Pages, so use plain HTML, CSS and JavaScript only (no build step, no server code).

Rules:
- Read existing files with read_file before changing them, and keep the site's existing style, layout and links consistent.
- When the work is ready, call propose_changes with the COMPLETE content of every file you create or update. The owner approves before anything goes live.
- Keep changes small and focused on what was asked. Never touch CNAME, .env files, or anything in .github.
- If the request is unclear, or is not about the website, reply in plain text with one short question instead of guessing.
- Replies are read on a phone: be brief and plain.

Files currently in the repository:
${list}${more}`;
}

async function callClaude({ apiKey, model, system, messages }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 16000, system, tools: TOOLS, messages }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = (data && data.error && data.error.message) || `status ${res.status}`;
    throw new Error(`Claude API error: ${reason}`);
  }
  return data;
}

function cleanProposal(input) {
  const problems = [];
  const changes = [];
  const seen = new Set();

  for (const change of Array.isArray(input.changes) ? input.changes : []) {
    const reason = validatePath(change && change.path);
    if (reason) {
      problems.push(`${change && change.path}: ${reason}`);
      continue;
    }
    if (seen.has(change.path)) continue;
    seen.add(change.path);

    if (change.action === 'delete') {
      changes.push({ path: change.path, action: 'delete' });
    } else if (typeof change.content === 'string') {
      changes.push({ path: change.path, action: change.action, content: change.content });
    } else {
      problems.push(`${change.path}: no content given`);
    }
  }
  return { summary: String(input.summary || '').slice(0, 600), changes, problems };
}

// Returns { type: 'proposal', summary, changes, problems } or { type: 'reply', text }.
async function planChange({ apiKey, model, siteUrl, instruction, github }) {
  const files = await github.listFiles();
  const system = buildSystemPrompt(siteUrl, files);
  const messages = [{ role: 'user', content: instruction }];

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await callClaude({ apiKey, model, system, messages });

    if (response.stop_reason === 'max_tokens') {
      return {
        type: 'reply',
        text: 'That change is too big to do in one go. Please ask for it in smaller steps.',
      };
    }

    const toolUses = response.content.filter((block) => block.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return { type: 'reply', text: text || 'I did not understand that. Can you rephrase?' };
    }

    const proposal = toolUses.find((block) => block.name === 'propose_changes');
    if (proposal) {
      const cleaned = cleanProposal(proposal.input || {});
      if (cleaned.changes.length === 0) {
        return {
          type: 'reply',
          text: cleaned.problems.length
            ? `I could not make that change: ${cleaned.problems.join('; ')}`
            : 'I did not find anything to change.',
        };
      }
      return { type: 'proposal', ...cleaned };
    }

    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const block of toolUses) {
      let content;
      let isError = false;
      const reason = block.name === 'read_file' ? validatePath(block.input && block.input.path) : 'unknown tool';
      if (reason) {
        content = `Cannot read: ${reason}`;
        isError = true;
      } else {
        try {
          content = await github.readFile(block.input.path);
        } catch (err) {
          content = `Cannot read: ${err.message}`;
          isError = true;
        }
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content, is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }

  return { type: 'reply', text: 'That took too many steps. Please try a simpler request.' };
}

module.exports = { planChange };
