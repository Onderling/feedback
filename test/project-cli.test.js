// The box's `project.js`: the four levers on the config (built values pass, reserved say "not yet"),
// the OR template validates as-is, and `new` + `list` work against a file store without a CSS
// (the central pod is then honestly "none"). `run`/`aggregate` need Telegram / a CSS — walked, not unit-tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateProjectConfig, LEVERS, RESERVED_LEVER_VALUES } from '../src/config/project-config.js';

const ROOT = resolve(import.meta.dirname, '..');
const base = { projectId: 'x', llm: { route: 'local', model: 'm' }, aggregation: { k: 3 } };

test('levers: defaults are the built OR values; every reserved value answers "not yet" with its name', () => {
  const c = validateProjectConfig(base);
  assert.deepEqual([c.channels, c.participants, c.botMode, c.output], [['telegram'], { home: 'hosted', lifetime: 'project' }, 'collect', ['tracks']]);
  for (const v of LEVERS.channels.built) validateProjectConfig({ ...base, channels: [v] });
  for (const v of LEVERS['participants.home'].built) validateProjectConfig({ ...base, participants: { home: v } });
  assert.throws(() => validateProjectConfig({ ...base, channels: ['whatsapp'] }), /not yet: channels "whatsapp"/);
  assert.throws(() => validateProjectConfig({ ...base, participants: { lifetime: 'person' } }), /not yet: participants\.lifetime "person"/);
  assert.throws(() => validateProjectConfig({ ...base, botMode: 'ask' }), /not yet: botMode "ask"/);
  assert.throws(() => validateProjectConfig({ ...base, output: ['tracks', 'clinical'] }), /not yet: output "clinical"/);
  assert.throws(() => validateProjectConfig({ ...base, channels: ['fax'] }));   // unknown ≠ reserved: a plain schema error
  assert.deepEqual(Object.keys(RESERVED_LEVER_VALUES), Object.keys(LEVERS));
});

test('the OR template validates as-is and uses only built lever values', () => {
  const t = JSON.parse(readFileSync(join(ROOT, 'templates/or-feedback.json'), 'utf8'));
  delete t.$comment;
  const c = validateProjectConfig(t);
  assert.equal(c.botMode, 'collect');
  assert.equal(c.aggregation.k, 5);
  assert.ok(c.signal.escalationCategories.includes('child-safety'));
});

test('project new (template, no CSS) registers the project, mints codes, says the pod is none; list shows it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fp-project-'));
  const env = { ...process.env, FP_PORTAL_STORE: join(dir, 'store.json'), FP_PROJECT_SECRETS: join(dir, 'projects.env'), FP_INVITE_BASE: 'https://activate.example.org/' };
  delete env.CSS_URL;
  const r = spawnSync(process.execPath, ['scripts/project.js', 'new', 'or-ziekenhuis', '--template', 'or-feedback', '--name', 'OR Ziekenhuis X', '--codes', '7'], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /project or-ziekenhuis \(OR Ziekenhuis X\)/);
  assert.match(r.stdout, /channels telegram · participants hosted\/project · bot collect · output tracks/);
  assert.match(r.stdout, /central pod: none/);
  assert.match(r.stdout, /7 invite codes/);
  assert.match(r.stdout, /https:\/\/activate\.example\.org\//);
  assert.match(r.stdout, /FP_TG_TOKEN_OR_ZIEKENHUIS/);
  assert.ok(existsSync(join(dir, 'store.json')));
  assert.ok(!existsSync(join(dir, 'projects.env')), 'no secrets written without a CSS');

  const again = spawnSync(process.execPath, ['scripts/project.js', 'new', 'or-ziekenhuis', '--template', 'or-feedback'], { cwd: ROOT, encoding: 'utf8', env });
  assert.notEqual(again.status, 0); assert.match(again.stderr, /already exists/);

  const reserved = spawnSync(process.execPath, ['scripts/project.js', 'new', 'diary', '--template', 'or-feedback', '--config', join(ROOT, 'test/fixtures/diary-reserved.json')], { cwd: ROOT, encoding: 'utf8', env });
  assert.notEqual(reserved.status, 0); assert.match(reserved.stderr, /not yet: botMode "ask"/);

  const l = spawnSync(process.execPath, ['scripts/project.js', 'list'], { cwd: ROOT, encoding: 'utf8', env: { ...env, FP_TG_TOKEN_OR_ZIEKENHUIS: '1:x' } });
  assert.equal(l.status, 0, l.stderr);
  assert.match(l.stdout, /or-ziekenhuis\s+OR Ziekenhuis X\s+activations\s+0\/50\s+pod memory\s+tg yes\s+k 5/);
});
