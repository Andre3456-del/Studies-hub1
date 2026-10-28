'use strict';

const crypto = require('node:crypto');

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const CHUNK = 3800; // WhatsApp text limit is 4096 characters

function verifySignature(rawBody, header, appSecret) {
  if (!rawBody || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pulls plain text messages out of a WhatsApp Cloud API webhook payload.
function extractMessages(body) {
  const found = [];
  for (const entry of (body && body.entry) || []) {
    for (const change of entry.changes || []) {
      for (const message of (change.value && change.value.messages) || []) {
        if (message.type === 'text' && message.text && message.text.body) {
          found.push({ id: message.id, from: String(message.from), text: message.text.body });
        }
      }
    }
  }
  return found;
}

function splitText(text) {
  const parts = [];
  let rest = text;
  while (rest.length > CHUNK) {
    let cut = rest.lastIndexOf('\n', CHUNK);
    if (cut < CHUNK / 2) cut = CHUNK;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  parts.push(rest);
  return parts;
}

function createWhatsapp({ token, phoneId }) {
  async function sendText(to, text) {
    for (const part of splitText(text)) {
      const res = await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: part },
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
      }
    }
  }
  return { sendText };
}

module.exports = { verifySignature, extractMessages, createWhatsapp };
