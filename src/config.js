'use strict';

const REQUIRED = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'VERIFY_TOKEN',
  'APP_SECRET',
  'OWNER_PHONE',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'SITE_REPO',
];

function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.SITE_REPO)) {
    throw new Error('SITE_REPO must look like owner/repo');
  }

  return {
    port: Number(env.PORT) || 3000,
    whatsappToken: env.WHATSAPP_TOKEN,
    phoneId: env.WHATSAPP_PHONE_ID,
    verifyToken: env.VERIFY_TOKEN,
    appSecret: env.APP_SECRET,
    ownerPhone: env.OWNER_PHONE.replace(/\D/g, ''),
    anthropicKey: env.ANTHROPIC_API_KEY,
    model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    githubToken: env.GITHUB_TOKEN,
    siteRepo: env.SITE_REPO,
    siteBranch: env.SITE_BRANCH || 'main',
    siteUrl: env.SITE_URL || 'https://studieshub.org',
  };
}

module.exports = { loadConfig };
