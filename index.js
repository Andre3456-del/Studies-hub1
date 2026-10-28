'use strict';

const http = require('node:http');
const { loadConfig } = require('./src/config');
const { createGithub } = require('./src/github');
const { createWhatsapp, verifySignature, extractMessages } = require('./src/whatsapp');
const { planChange } = require('./src/claude');

const PENDING_TTL_MS = 30 * 60 * 1000;
const YES = new Set(['yes', 'y', 'approve', 'approved', 'ok', 'okay', 'go', 'publish', 'confirm']);
const NO = new Set(['no', 'n', 'cancel', 'reject', 'stop', 'discard']);

const HELP = [
  'Studies Hub bot. Tell me what to create or change on the site, for example:',
  '"Add a Biology study guide page and link it from the homepage."',
  '',
  'I will show you the plan first. Reply YES to publish it or NO to cancel.',
].join('\n');

function describe(proposal) {
  const verbs = { create: 'Create', update: 'Update', delete: 'Delete' };
  const lines = proposal.changes.map((c) => `- ${verbs[c.action] || 'Update'} ${c.path}`);
  const notes = proposal.problems.length ? `\n\nSkipped: ${proposal.problems.join('; ')}` : '';
  return `${proposal.summary}\n\n${lines.join('\n')}${notes}\n\nReply YES to publish or NO to cancel.`;
}

function createApp(config, deps = {}) {
  const github = deps.github || createGithub({
    token: config.githubToken,
    repo: config.siteRepo,
    branch: config.siteBranch,
  });
  const whatsapp = deps.whatsapp || createWhatsapp({
    token: config.whatsappToken,
    phoneId: config.phoneId,
  });
  const plan = deps.planChange || planChange;

  let pending = null; // { proposal, createdAt }
  let queue = Promise.resolve();
  const seen = new Set();

  async function handleText(text) {
    const word = text.trim().toLowerCase().replace(/[.!]+$/, '');
    const reply = (message) => whatsapp.sendText(config.ownerPhone, message);

    if (pending && Date.now() - pending.createdAt > PENDING_TTL_MS) pending = null;

    if (['help', 'hi', 'hello', 'start'].includes(word)) return reply(HELP);

    if (pending && NO.has(word)) {
      pending = null;
      return reply('Cancelled. Nothing was changed.');
    }

    if (pending && YES.has(word)) {
      const { proposal } = pending;
      pending = null;
      const url = await github.commitChanges(proposal.changes, `Bot: ${proposal.summary || 'update site'}`);
      return reply(
        `Published. GitHub Pages usually shows the change within 1 to 2 minutes at ${config.siteUrl}\n${url}`
      );
    }

    if (YES.has(word) || NO.has(word)) {
      return reply('There is nothing waiting for approval. Tell me what you want changed.');
    }

    const replacing = pending !== null;
    pending = null;
    await reply('Working on it...');
    const result = await plan({
      apiKey: config.anthropicKey,
      model: config.model,
      siteUrl: config.siteUrl,
      instruction: text,
      github,
    });

    if (result.type === 'proposal') {
      pending = { proposal: result, createdAt: Date.now() };
      return reply((replacing ? '(Replaced your earlier unpublished plan.)\n\n' : '') + describe(result));
    }
    return reply(result.text);
  }

  function enqueue(message) {
    queue = queue
      .then(() => handleText(message.text))
      .catch(async (err) => {
        console.error('Error handling message:', err);
        try {
          await whatsapp.sendText(config.ownerPhone, `Something went wrong: ${err.message}`);
        } catch (sendErr) {
          console.error('Could not send error message:', sendErr);
        }
      });
  }

  function send(res, status, body = '', type = 'text/plain') {
    res.writeHead(status, { 'Content-Type': type });
    res.end(body);
  }

  function readBody(req, limit = 1_000_000) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) {
          reject(new Error('Body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async function onWebhookPost(req, res) {
    let raw;
    try {
      raw = await readBody(req);
    } catch {
      return send(res, 413);
    }
    if (!verifySignature(raw, req.headers['x-hub-signature-256'], config.appSecret)) {
      return send(res, 401);
    }

    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return send(res, 400);
    }
    send(res, 200);

    for (const message of extractMessages(body)) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      if (seen.size > 500) seen.delete(seen.values().next().value);

      if (message.from.replace(/\D/g, '') !== config.ownerPhone) {
        console.warn('Ignored message from a number that is not the owner.');
        continue;
      }
      enqueue(message);
    }
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, 'Studies Hub bot is running.');
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
    }
    // Meta calls this once when you set up the webhook.
    if (req.method === 'GET' && url.pathname === '/webhook') {
      const ok =
        url.searchParams.get('hub.mode') === 'subscribe' &&
        url.searchParams.get('hub.verify_token') === config.verifyToken;
      return ok ? send(res, 200, url.searchParams.get('hub.challenge') || '') : send(res, 403);
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      return onWebhookPost(req, res).catch((err) => {
        console.error('Webhook error:', err);
        if (!res.headersSent) send(res, 500);
      });
    }
    return send(res, 404);
  });
}

if (require.main === module) {
  const config = loadConfig();
  createApp(config).listen(config.port, () => {
    console.log(`Studies Hub bot listening on port ${config.port}, editing ${config.siteRepo}@${config.siteBranch}`);
  });
}

module.exports = { createApp };
