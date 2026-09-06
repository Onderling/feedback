// The intent classifier's deterministic tier, IN the suite: a short, unambiguous control utterance or a
// greeting must be decided without a model, and a feedback line must never become a command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from '../src/channel/intent.js';
import { INTENT } from '../scripts/feedback-eval.fixtures.mjs';

test('intent golden set — deterministic tier', async () => {
  const misses = [];
  for (const f of INTENT.filter((x) => x.tier === 'det')) {
    const got = (await classifyIntent(f.text)).kind;
    if (got !== f.expect) misses.push(`${f.id} "${f.text}" → ${got} (wanted ${f.expect})`);
  }
  assert.deepEqual(misses, []);
});
