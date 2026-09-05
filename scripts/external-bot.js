#!/usr/bin/env node
// external-bot — the feedback bot as ITS OWN AGENT, reachable from any basis client as a contact.
//
// What it stands up:
//   · an identity of its own (persisted in a small file vault under --data-dir),
//   · a secure-agent over a relay (the same peer link basis clients use),
//   · an A2A agent card at http://<host>:<port>/.well-known/agent.json — basis adds the bot by that
//     URL, reads the card, and honours the card's ask `redact: 'pre-send'` by redacting on the
//     participant's device before anything is sent here,
//   · the feedback bot itself (BasisBot over PeerBridge, speaking basis's generic contact-msg wire).
//
//   FP_RELAY_URL=ws://localhost:8791 FP_CARD_PORT=8794 FP_CARD_URL=http://localhost:8794 \
//   FP_LLM_ROUTE=local FP_LLM_MODEL=mistral:7b-instruct node scripts/external-bot.js [--data-dir ./.feedback-bot]
//
// The pod is in-memory unless CSS owner credentials are present (see tg-bot-smoke.js for that wiring);
// this script is the contact-side twin of tg-bot-smoke.js.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createSecureAgent } from '@onderling/secure-agent';
import { A2ATransport } from '@onderling/core';
import { InMemoryCentralPod } from '../src/pod/central-pod.js';
import { validateProjectConfig } from '../src/config/project-config.js';
import { walkLog, walkLogOn, walkLogFile } from '../src/walk-log.js';
import { startExternalCanopyBot } from './basis-bot.js';

const { values } = parseArgs({ options: { 'data-dir': { type: 'string', default: './.feedback-bot' } } });
const dataDir = path.resolve(values['data-dir']);
mkdirSync(dataDir, { recursive: true });

const relayUrl = process.env.FP_RELAY_URL;
if (!relayUrl) { console.error('external-bot: set FP_RELAY_URL (ws://… or wss://…)'); process.exit(2); }
const cardPort = Number(process.env.FP_CARD_PORT || 8794);
const cardUrl  = process.env.FP_CARD_URL || `http://localhost:${cardPort}`;

// A file-backed vault: the bot keeps the same identity across restarts.
function fileVault(file) {
  const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
  const save = (o) => writeFileSync(file, JSON.stringify(o), { mode: 0o600 });
  return {
    async get(k) { return load()[k] ?? null; },
    async set(k, v) { const o = load(); o[k] = v; save(o); },
    async has(k) { return k in load(); },
    async delete(k) { const o = load(); delete o[k]; save(o); },
    async keys() { return Object.keys(load()); },
  };
}

const config = validateProjectConfig({
  projectId: process.env.FP_PROJECT_ID || 'contact-walk',
  projectName: process.env.FP_PROJECT_NAME || 'Feedback',
  llm: { route: process.env.FP_LLM_ROUTE || 'local', model: process.env.FP_LLM_MODEL || process.env.FP_MODEL || 'mistral:7b-instruct',
         ...(process.env.FP_LLM_BASEURL ? { baseURL: process.env.FP_LLM_BASEURL } : {}) },
  aggregation: { k: Number(process.env.FP_K || 3) },
  signal: { layer1OnDevice: true, escalationCategories: ['crisis'] },
});

let bridgeRef = null;
const sa = await createSecureAgent({
  vault: fileVault(path.join(dataDir, 'identity.json')),
  relayUrl,
  transportMode: 'relay',   // the bot lives on the relay; nothing else is connected
  warnOnInsecure: false,
  onPeerMessage: (env) => bridgeRef?.onPeerMessage(env),
});
await sa.relay.connect({ relayUrl });

walkLog({ kind: 'run', bot: 'external-contact', project: config.projectId, llm: { route: config.llm.route, model: config.llm.model } });
if (walkLogOn()) console.log(`walk log → ${walkLogFile()}`);
const pod = new InMemoryCentralPod();
const { bridge, stop } = await startExternalCanopyBot({ peer: sa.peer, pod, config, participantFor: (c) => c });
bridgeRef = bridge;

// The card: who the bot is, and what it asks of a client before sending.
const card = new A2ATransport({
  agent: sa.agent, port: cardPort, host: '0.0.0.0', baseUrl: cardUrl,
  cardConfig: {
    name: config.projectName || 'Feedback bot',
    description: 'Feedback assistant — what you send is cleaned and only shared with your consent.',
    redact: 'pre-send',
  },
});
await card.connect();

console.log(`external-bot: up`);
console.log(`  card     ${cardUrl}/.well-known/agent.json`);
console.log(`  address  ${sa.identity?.pubKey ?? sa.agent?.pubKey ?? '?'}`);
console.log(`  relay    ${relayUrl}`);
console.log(`  llm      ${config.llm.route} / ${config.llm.model}`);
const bye = async () => { try { await card.disconnect?.(); await stop(); } finally { process.exit(0); } };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
