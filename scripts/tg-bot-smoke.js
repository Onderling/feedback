// Live Telegram smoke (Tier 2) — runs the feedback bot against the REAL
// @onderling/chat-agent TelegramBridge, so you can talk to it from Telegram and watch the
// whole journey: message -> floor (post-receipt, in this bot service) -> /klaar review ->
// consent buttons -> contribution written to the central pod.
//
//   FP_TG_BOT_TOKEN=123:ABC \
//   FP_LLM_BASEURL=http://localhost:11434/v1 FP_LLM_MODEL=qwen2.5:7b \
//   node scripts/tg-bot-smoke.js
//
// Skips cleanly (exit 0) if no token, or if the chat-agent substrate isn't available.
// The pod here is in-memory (a smoke); a real deployment passes a CssCentralPod +
// an HMAC participantFor so the pod never holds a reversible chat id.

import { validateProjectConfig } from '../src/config/project-config.js';
import { walkLogOn, walkLogFile } from '../src/walk-log.js';
import { startTelegramProjectBot } from '../src/host/project-bot.js';

const token = process.env.FP_TG_BOT_TOKEN || process.env.HOUSEHOLD_TG_BOT_TOKEN;
if (!token) { console.log('SKIP: set FP_TG_BOT_TOKEN (a Telegram bot token)'); process.exit(0); }
if ((process.env.FP_LLM_ROUTE || 'local') === 'local' && !process.env.FP_LLM_BASEURL) console.log('NOTE: local route without FP_LLM_BASEURL — review/clean will hit the default Ollama; set FP_LLM_ROUTE=privatemode for the enclave.');

// Privacy is config-driven: set FP_PROJECT_PUBKEY to have the bot SEAL every contribution to
// the project key (the bot is a host-blind writer — it never holds the private key).
const config = validateProjectConfig({
  projectId: 'tg-smoke',
  llm: { route: process.env.FP_LLM_ROUTE || 'local', model: process.env.FP_LLM_MODEL || process.env.FP_MODEL || 'qwen2.5:7b' },
  aggregation: { k: 3 },
  // every category on: the walk must see the offer the label layer earns (walk 5: safety + child-safety
  // labelled, no offer, because this list said crisis only)
  signal: { layer1OnDevice: true },
  ...(process.env.FP_PROJECT_PUBKEY ? { privacy: { seal: true, projectPublicKey: process.env.FP_PROJECT_PUBKEY } } : {}),
});
// The composition is shared with the box's `project.js run` (src/host/project-bot.js): route applied and
// checked up front, CSS pods + provisioning when owner credentials are present, in-memory otherwise (said).
let started;
try {
  started = await startTelegramProjectBot({ config, token, pseudonymSecret: process.env.FP_PSEUDONYM_SECRET,
    owner: process.env.CSS_URL && process.env.FP_OWNER_CLIENT_ID && process.env.FP_PROJECT_POD
      ? { cssUrl: process.env.CSS_URL, clientId: process.env.FP_OWNER_CLIENT_ID, clientSecret: process.env.FP_OWNER_CLIENT_SECRET, ownerWebId: process.env.FP_OWNER_WEBID, projectPod: process.env.FP_PROJECT_POD }
      : undefined });
} catch (e) {
  if (/chat-agent|Cannot find/.test(e.message)) { console.log('SKIP: chat-agent substrate not available —', e.message); process.exit(0); }
  throw e;
}
if (walkLogOn()) console.log(`walk log → ${walkLogFile()}`);

console.log('feedback bot running (long-polling). DM it, then /klaar, then tap a consent button. Ctrl-C to stop.');
process.on('SIGINT', async () => { console.log('\nstopping…'); await started.stop(); process.exit(0); });
