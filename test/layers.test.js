// The per-message layers (src/layers.js): named once, switchable per project, one walk-log line each.
// Proves: a switch is honoured by the floor AND the model pass under the same name; an unknown name fails
// loudly; the `label` layer offers an escalation for a line only a model can label — and not when it is off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMockLlm } from './helpers/mock-llm.js';
import { LAYERS, layerSwitch } from '../src/layers.js';
import { floorMessage } from '../src/floors/index.js';
import { softenClean } from '../src/pipeline.js';
import { validateProjectConfig } from '../src/config/project-config.js';
import { ChannelDispatcher } from '../src/channel/dispatcher.js';
import { MemoryChannelAdapter } from '../src/channel/adapter.js';
import { InMemoryCentralPod } from '../src/pod/central-pod.js';

test('layerSwitch: every listed layer is on by default; an unknown name throws', () => {
  const sw = layerSwitch();
  for (const l of LAYERS) assert.equal(sw.on(l), true);
  assert.equal(layerSwitch(['profanity']).on('profanity'), false);
  assert.throws(() => layerSwitch(['swearing']), /unknown layer "swearing"/);
  assert.throws(() => validateProjectConfig({ projectId: 'x', layers: { disabled: ['swearing'] } }));
});

test('floorMessage: one trace line per deterministic layer; a switched-off layer is recorded as skipped and does nothing', () => {
  const fm = floorMessage('Henk de Vries is een klootzak, bel 06-12345678');
  assert.deepEqual(fm.trace.map((t) => t.layer), ['reject', 'signal', 'redact', 'names', 'profanity']);
  assert.ok(fm.trace.every((t) => typeof t.ms === 'number'));
  assert.ok(!fm.floored.includes('klootzak') && !fm.floored.includes('12345678') && !fm.floored.includes('Henk'));

  const kept = floorMessage('Henk is een klootzak', { layers: { disabled: ['profanity'] } });
  assert.ok(kept.floored.includes('klootzak'), 'profanity stays when the layer is off');
  assert.ok(!kept.floored.includes('Henk'), 'the names layer still ran');
  assert.deepEqual(kept.trace.find((t) => t.layer === 'profanity'), { layer: 'profanity', ms: kept.trace.find((t) => t.layer === 'profanity').ms, skipped: true });
});

test('softenClean: the same profanity switch turns off the model decurse pass (and its deterministic sweep)', async () => {
  const mock = await startMockLlm();
  process.env.FP_LLM_BASEURL = mock.url;
  try {
    const on = await softenClean('mock', 'de service is klote', 'nl', { promptProfile: 'verbose' });
    assert.ok(!/klote/.test(on.cleaned), 'on: the deterministic sweep under the pass removes it');
    const off = await softenClean('mock', 'de service is klote', 'nl', { promptProfile: 'verbose', layers: { disabled: ['profanity'] } });
    assert.ok(/klote/.test(off.cleaned), 'off: profanity kept');
  } finally { await mock.close(); }
});

const config = (extra = {}) => validateProjectConfig({
  projectId: 'layers', llm: { route: 'local', model: 'mock' }, aggregation: { k: 1 },
  signal: { layer1OnDevice: true, escalationCategories: ['crisis', 'child-safety'] }, ...extra,
});
const LINE = 'mijn dochter van 8 werd uit huis geplaatst en niemand zei ons waarom';

test('label layer: a line the lexicons miss gets an escalation offer from the model — not when the layer is off', async () => {
  const mock = await startMockLlm();
  process.env.FP_LLM_BASEURL = mock.url;
  try {
    assert.equal(floorMessage(LINE).signal, null, 'precondition: the deterministic floor does not see it');
    const a = new MemoryChannelAdapter();
    const d = new ChannelDispatcher({ adapter: a, pod: new InMemoryCentralPod(), config: config(), participant: 'p1' });
    const r = await d.handleMessage(LINE);
    assert.deepEqual(r.signal, { category: 'child-safety', via: 'llm', confirmed: false });
    assert.ok(a.sent.some((m) => m.type === 'escalation-offer' && m.category === 'child-safety'), 'the offer was made');

    const b = new MemoryChannelAdapter();
    const d2 = new ChannelDispatcher({ adapter: b, pod: new InMemoryCentralPod(), config: config({ layers: { disabled: ['label'] } }), participant: 'p1' });
    const r2 = await d2.handleMessage(LINE);
    assert.equal(r2.signal, null);
    assert.ok(!b.sent.some((m) => m.type === 'escalation-offer'), 'no offer when the label layer is off');
  } finally { await mock.close(); }
});
