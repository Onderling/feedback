#!/usr/bin/env node
// project — a feedback project on a box, as one command (the operator's side; the portal is the
// project lead's). Wraps what already exists: the portal's ProjectStore (register + invite codes),
// css-bootstrap (reserve the central pod), the per-project Telegram bot, and the aggregation runner.
//
//   node scripts/project.js new <id> [--template or-feedback] [--config file.json] [--codes 50]
//                                     [--css-url http://pod:3000] [--name "OR-kanaal"] [--k 5]
//   node scripts/project.js list
//   node scripts/project.js run                      # one Telegram bot per project with a token; stays up
//   node scripts/project.js aggregate [<id>] [--every 86400]   # report + metrics per project, once or looping
//
// State: the portal store (FP_PORTAL_STORE, default ./portal-store.json — the same file the portal and the
// activation service read) and a secrets file (FP_PROJECT_SECRETS, default ./projects.env) holding each
// project's pod-owner credentials as FP_<ID>_OWNER_CLIENT_ID etc. The Telegram token for a project is
// FP_TG_TOKEN_<ID> in the environment (or in the secrets file). Never printed.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { ProjectStore } from '../src/portal/project-store.js';
import { inviteLink } from '../src/portal/project-store.js';
import { validateProjectConfig, RESERVED_LEVER_VALUES } from '../src/config/project-config.js';
import { bootstrapOwner } from '../src/pod/css-bootstrap.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const STORE = process.env.FP_PORTAL_STORE || './portal-store.json';
const SECRETS = process.env.FP_PROJECT_SECRETS || './projects.env';
const REPORTS = process.env.FP_REPORTS_DIR || './reports';
const ENV_ID = (id) => id.toUpperCase().replace(/[^A-Z0-9]/g, '_');

const loadStore = () => (existsSync(STORE) ? ProjectStore.fromJSON(JSON.parse(readFileSync(STORE, 'utf8'))) : new ProjectStore());
const saveStore = (s) => writeFileSync(STORE, JSON.stringify(s.toJSON(), null, 2));
function loadSecrets() {
  const out = {};
  if (existsSync(SECRETS)) for (const line of readFileSync(SECRETS, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2];
  }
  return { ...out, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('FP_'))) };
}
const ownerFor = (id, sec) => {
  const p = `FP_${ENV_ID(id)}_OWNER_`;
  return sec[`${p}CLIENT_ID`] ? { cssUrl: sec[`${p}CSS_URL`], clientId: sec[`${p}CLIENT_ID`], clientSecret: sec[`${p}CLIENT_SECRET`], ownerWebId: sec[`${p}WEBID`], projectPod: sec[`${p}PROJECT_POD`] } : null;
};

const [cmd, ...rest] = process.argv.slice(2);
const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
  template: { type: 'string' }, config: { type: 'string' }, codes: { type: 'string', default: '50' },
  'css-url': { type: 'string' }, name: { type: 'string' }, k: { type: 'string' }, every: { type: 'string' },
  'invite-base': { type: 'string' }, 'expires-days': { type: 'string', default: '365' },
} });

/** Build the project config from a template and/or a config file, with the id and overrides applied. */
export function buildProjectConfig({ id, template, configFile, name, k, readFile = (f) => JSON.parse(readFileSync(f, 'utf8')) }) {
  let base = {};
  if (template) {
    const f = path.resolve(HERE, '..', 'templates', `${template}.json`);
    if (!existsSync(f)) throw new Error(`no template "${template}" (templates/${template}.json)`);
    base = readFile(f);
  }
  if (configFile) base = { ...base, ...readFile(configFile) };
  delete base.$comment;
  const cfg = { ...base, projectId: id, ...(name ? { projectName: name } : {}), ...(k ? { aggregation: { ...(base.aggregation || {}), k: Number(k) } } : {}) };
  return validateProjectConfig(cfg);   // reserved lever values fail here with "not yet"
}

async function cmdNew() {
  const id = positionals[0];
  if (!id) throw new Error('usage: project new <id> [--template t] [--config f]');
  const config = buildProjectConfig({ id, template: values.template, configFile: values.config, name: values.name, k: values.k });
  const store = loadStore();
  const expiresAt = new Date(Date.now() + Number(values['expires-days']) * 86400e3).toISOString();
  store.createProject({ config, cohort: { expiresAt, ceiling: config.cohortHint || 100 }, inviteBase: values['invite-base'] || process.env.FP_INVITE_BASE });
  // reserve the central pod when a CSS is reachable; say so plainly when it is not
  const cssUrl = values['css-url'] || process.env.CSS_URL;
  let pod = 'none (in-memory until a CSS is given: --css-url or CSS_URL)';
  if (cssUrl) {
    const o = await bootstrapOwner({ cssUrl, podName: id });
    const p = `FP_${ENV_ID(id)}_OWNER_`;
    appendFileSync(SECRETS, `${p}CSS_URL=${cssUrl}\n${p}CLIENT_ID=${o.clientId}\n${p}CLIENT_SECRET=${o.clientSecret}\n${p}WEBID=${o.webId}\n${p}PROJECT_POD=${o.pod}\n`, { mode: 0o600 });
    pod = o.pod;
  }
  const codes = store.generateCodes(id, Number(values.codes));
  saveStore(store);
  const base = store.inviteBaseFor(id) || '';
  console.log(`project ${id} (${config.projectName || id})`);
  console.log(`  channels ${config.channels.join(', ')} · participants ${config.participants.home}/${config.participants.lifetime} · bot ${config.botMode} · output ${config.output.join(', ')}`);
  console.log(`  central pod: ${pod}`);
  console.log(`  telegram token: set FP_TG_TOKEN_${ENV_ID(id)} (env or ${SECRETS}) before \`project run\``);
  console.log(`  ${codes.length} invite codes${base ? ` (links under ${base})` : ''}:`);
  for (const c of codes.slice(0, 5)) console.log(`    ${base ? inviteLink(base, id, c) : c}`);
  if (codes.length > 5) console.log(`    … ${codes.length - 5} more (all in the portal)`);
}

function cmdList() {
  const store = loadStore(); const sec = loadSecrets();
  const rows = store.listProjects();
  if (!rows.length) { console.log('no projects'); return; }
  for (const s of rows) {
    console.log(`${s.projectId.padEnd(16)} ${String(s.projectName || '').padEnd(20)} activations ${String(s.activations).padStart(3)}/${s.ceiling}  pod ${ownerFor(s.projectId, sec) ? 'css' : 'memory'}  tg ${sec[`FP_TG_TOKEN_${ENV_ID(s.projectId)}`] ? 'yes' : 'no'}  k ${s.settings.k}  route ${s.settings.route}/${s.settings.model}`);
  }
}

async function cmdRun() {
  const { startTelegramProjectBot } = await import('../src/host/project-bot.js');
  const store = loadStore(); const sec = loadSecrets();
  const running = [];
  for (const s of store.listProjects()) {
    const token = sec[`FP_TG_TOKEN_${ENV_ID(s.projectId)}`];
    const config = store.projectConfig(s.projectId);
    if (!token) { console.log(`[${s.projectId}] no FP_TG_TOKEN_${ENV_ID(s.projectId)} — not started`); continue; }
    if (!config) { console.log(`[${s.projectId}] no config in the store — not started`); continue; }
    if (!config.channels.includes('telegram')) { console.log(`[${s.projectId}] telegram not in channels — not started`); continue; }
    running.push(await startTelegramProjectBot({ config, token, owner: ownerFor(s.projectId, sec), pseudonymSecret: sec.FP_PSEUDONYM_SECRET }));
  }
  if (!running.length) { console.log('nothing to run'); process.exit(0); }
  console.log(`${running.length} bot(s) running (long-polling). Ctrl-C to stop.`);
  const stop = async () => { for (const r of running) await r.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

async function cmdAggregate() {
  const { runProjectAggregation } = await import('../src/run.js');
  const { clientCredentialsFetch } = await import('../src/pod/css-auth.js');
  const { CssCentralPod } = await import('../src/pod/css-central-pod.js');
  const { cryptoForProject } = await import('../src/pod/crypto-config.js');
  const every = values.every ? Number(values.every) : 0;
  const once = async () => {
    const store = loadStore(); const sec = loadSecrets();
    for (const s of store.listProjects()) {
      if (positionals[0] && positionals[0] !== s.projectId) continue;
      const owner = ownerFor(s.projectId, sec);
      const config = store.projectConfig(s.projectId);
      if (!owner) { console.log(`[${s.projectId}] no pod — nothing to aggregate`); continue; }
      const ownerFetch = await clientCredentialsFetch({ cssUrl: owner.cssUrl, clientId: owner.clientId, clientSecret: owner.clientSecret });
      const pod = new CssCentralPod({ authedFetch: ownerFetch, podBase: `${owner.projectPod.replace(/\/$/, '')}/central/`, ...cryptoForProject({ config }) });
      const t0 = Date.now();
      try {
        const out = await runProjectAggregation({ pod, config });
        const dir = path.join(REPORTS, s.projectId); mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        writeFileSync(path.join(dir, `report-${stamp}.json`), JSON.stringify(out.aggregate, null, 2));
        // the counts the transparency report needs — never text
        const a = out.aggregate;
        const metrics = { at: new Date().toISOString(), items: a.items ?? null, aboveK: a.themes?.length ?? a.groups?.length ?? null, belowK: a.belowThreshold?.length ?? null, signals: a.signals?.length ?? null, ms: Date.now() - t0 };
        appendFileSync(path.join(dir, 'metrics.jsonl'), JSON.stringify(metrics) + '\n');
        console.log(`[${s.projectId}] aggregated → ${dir} (${out.location}, ${out.route})`);
      } catch (e) { console.error(`[${s.projectId}] aggregation failed: ${e.message}`); }
    }
  };
  await once();
  if (every > 0) { console.log(`aggregating every ${every}s`); setInterval(() => once().catch((e) => console.error(e.message)), every * 1000); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (cmd === 'new') await cmdNew();
    else if (cmd === 'list') cmdList();
    else if (cmd === 'run') await cmdRun();
    else if (cmd === 'aggregate') await cmdAggregate();
    else { console.log('usage: project new <id> | list | run | aggregate [<id>] [--every s]'); process.exit(2); }
  } catch (e) {
    console.error(`project ${cmd}: ${e.message}`);
    if (/not yet/.test(e.message)) console.error(`  reserved lever values (declared, not built): ${JSON.stringify(RESERVED_LEVER_VALUES)}`);
    process.exit(1);
  }
}
