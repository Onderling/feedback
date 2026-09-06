// The signal floor's golden set, IN the suite: a missed escalation category is a red build, no model needed.
// (plans/PLAN-feedback-verification.md, layer L1; the same fixtures scripts/feedback-eval.mjs scores.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorMessage } from '../src/floors/index.js';
import { SIGNAL } from '../scripts/feedback-eval.fixtures.mjs';

test('signal golden set: no false negative on an escalation category', () => {
  const misses = [];
  for (const f of SIGNAL) {
    if (f.tier === 'llm') continue;   // only a model can label these — not the floor's job
    const got = floorMessage(f.text).signal?.category ?? null;
    const twin = (a, b) => (a === 'abuse' && b === 'child-safety') || (a === 'child-safety' && b === 'abuse');
    if (f.expect && !(got === f.expect || twin(f.expect, got))) misses.push(`${f.id}: wanted ${f.expect}, got ${got ?? 'nothing'} — "${f.text.slice(0, 60)}"`);
  }
  assert.deepEqual(misses, []);
});

test('signal golden set: ordinary feedback does not escalate', () => {
  const false_positives = [];
  for (const f of SIGNAL) {
    if (f.expect !== null) continue;
    const got = floorMessage(f.text).signal?.category ?? null;
    if (got) false_positives.push(`${f.id}: ${got} — "${f.text.slice(0, 60)}"`);
  }
  assert.deepEqual(false_positives, []);
});
