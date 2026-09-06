#!/usr/bin/env node
/**
 * feedback-eval — the feedback bot's eval loop (plans/PLAN-feedback-verification.md in the monorepo).
 *
 * Golden sets per layer, scored, exit 1 when a layer misses its bar:
 *   signal — the deterministic escalation floor (no model; also runs in the suite: test/signal-golden.test.js)
 *   clean  — the identifier + decurse passes on the configured route (FP_LLM_ROUTE / FP_LLM_MODEL, like the bot)
 *   label  — the model-side signal label (the `label` layer) on the configured route: the model-tier signal lines
 *            must escalate, the plain lines must not
 *
 *   node scripts/feedback-eval.mjs                       # signal + clean + label
 *   node scripts/feedback-eval.mjs --layer signal        # deterministic only, instant
 *   FP_LLM_ROUTE=privatemode FP_LLM_MODEL=kimi-k2.6 FP_LLM_THINKING=off node scripts/feedback-eval.mjs --layer clean
 *   node scripts/feedback-eval.mjs --from-log ~/expotest/zzz/fb-walk-*.jsonl   # signal fixture stubs from a walk
 */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { floorMessage } from '../src/floors/index.js';
import { identifierPass, decursePass } from '../src/passes.js';
import { applyLlmRoute } from '../src/ollama.js';
import { labelOne } from '../src/triage.js';
import { SIGNAL, CLEAN } from './feedback-eval.fixtures.mjs';

const { values } = parseArgs({ options: {
  layer: { type: 'string', default: 'all' }, only: { type: 'string' }, 'from-log': { type: 'string' },
} });

if (values['from-log']) {
  for (const line of readFileSync(values['from-log'], 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.kind === 'layer' && e.layer === 'label' && e.signal) console.log(`  // the label layer said ${e.signal} at ${e.ts.slice(11, 19)}`);
    if (e.kind !== 'floor') continue;
    console.log(`  { id: 'walk-${e.ts.slice(11, 19).replace(/:/g, '')}', text: '<paste the line from the chat>', expect: ${e.signal ? `'${e.signal}'` : 'null'} },   // floor said ${e.signal ?? 'nothing'}, hits ${e.hits}`);
  }
  process.exit(0);
}

const pick = (list) => list.filter((f) => !values.only || f.id.includes(values.only));
let failed = false;

if (values.layer === 'all' || values.layer === 'signal') {
  console.log('── L1 signal floor (deterministic) ──');
  let fn = 0; let fp = 0; let ok = 0;
  for (const f of pick(SIGNAL).filter((x) => x.tier !== 'llm')) {
    const got = floorMessage(f.text).signal?.category ?? null;
    const pass = got === f.expect || (f.expect === 'abuse' && got === 'child-safety') || (f.expect === 'child-safety' && got === 'abuse');
    if (pass) ok += 1; else if (f.expect && !got) fn += 1; else fp += 1;
    console.log(`${pass ? '✓' : (f.expect && !got ? '✗ MISS' : '✗ diff')} ${f.id.padEnd(16)} ${f.text.slice(0, 64).padEnd(64)} → ${got ?? '—'}${pass ? '' : `  (wanted ${f.expect ?? '—'})`}`);
  }
  console.log(`signal: ${ok}/${pick(SIGNAL).filter((x) => x.tier !== 'llm').length} (+${pick(SIGNAL).filter((x) => x.tier === 'llm').length} model-tier, skipped) · ${fn} false negative(s) · ${fp} other\n`);
  if (fn > 0) failed = true;   // a missed escalation is the failure that matters
}

if (values.layer === 'all' || values.layer === 'clean') {
  console.log('── L2 clean passes (the configured route) ──');
  const { model } = routeUp();
  let ok = 0; const n = pick(CLEAN).length;
  for (const f of pick(CLEAN)) {
    const t0 = Date.now();
    const floored = floorMessage(f.text, { userDefault: f.lang }).floored;
    const a = await identifierPass(model, floored, f.lang, { thinking: process.env.FP_LLM_THINKING || 'off' });
    const b = await decursePass(model, a.text, f.lang, { thinking: process.env.FP_LLM_THINKING || 'off' });
    const out = b.text;
    const problems = checkProps(out, f.props);
    const err = a.error || b.error;
    const pass = problems.length === 0 && !err;
    if (pass) ok += 1;
    console.log(`${pass ? '✓' : '✗'} ${f.id.padEnd(20)} ${String(Date.now() - t0).padStart(5)}ms ${out.slice(0, 90)}${pass ? '' : `  ← ${err ? `route: ${err}` : problems.join('; ')}`}`);
  }
  const rate = n ? ok / n : 0;
  console.log(`clean: ${ok}/${n} (${Math.round(rate * 100)}%)\n`);
  if (rate < 0.95) failed = true;
}
if (values.layer === 'all' || values.layer === 'label') {
  console.log('── L1b label layer (the model, the configured route) ──');
  const { model } = routeUp();
  // the model-tier lines must escalate; the lines the floor must NOT escalate must stay quiet here too
  const set = pick(SIGNAL).filter((x) => x.tier === 'llm' || !x.expect);
  let ok = 0; let fn = 0; let fp = 0;
  for (const f of set) {
    const t0 = Date.now();
    const fm = floorMessage(f.text);
    const { signal } = await labelOne(model, fm.floored, f.text, { thinking: process.env.FP_LLM_THINKING || 'off' });
    const got = signal?.category ?? null;
    const pass = got === f.expect || (f.expect === 'abuse' && got === 'child-safety') || (f.expect === 'child-safety' && got === 'abuse');
    if (pass) ok += 1; else if (f.expect && !got) fn += 1; else fp += 1;
    console.log(`${pass ? '✓' : (f.expect && !got ? '✗ MISS' : '✗ diff')} ${f.id.padEnd(16)} ${String(Date.now() - t0).padStart(5)}ms ${f.text.slice(0, 58).padEnd(58)} → ${got ?? '—'}${pass ? '' : `  (wanted ${f.expect ?? '—'})`}`);
  }
  console.log(`label: ${ok}/${set.length} · ${fn} false negative(s) · ${fp} other\n`);
  if (fn > 0) failed = true;
}
process.exit(failed ? 1 : 0);

function routeUp() {
  const route = process.env.FP_LLM_ROUTE || 'local';
  const model = process.env.FP_LLM_MODEL || process.env.FP_MODEL || (route === 'privatemode' ? 'kimi-k2.6' : 'qwen2.5:7b-instruct');
  const applied = applyLlmRoute({ route, model });
  console.log(`route ${applied.route} (${applied.baseURL}) model ${model}`);
  return { route, model };
}

function checkProps(out, props = {}) {
  const low = out.toLowerCase();
  const problems = [];
  for (const name of props.noName ?? []) if (low.includes(name.toLowerCase())) problems.push(`name "${name}" still there`);
  for (const w of props.noProfanity ?? []) if (low.includes(w.toLowerCase())) problems.push(`profanity "${w}" still there`);
  for (const w of props.noText ?? []) if (low.includes(w.toLowerCase())) problems.push(`"${w}" still there`);
  if (props.noPhone && /\d[\d\s-]{7,}\d/.test(out)) problems.push('a phone-shaped number still there');
  for (const k of props.keeps ?? []) if (!new RegExp(k, 'i').test(out)) problems.push(`lost "${k}"`);
  return problems;
}
