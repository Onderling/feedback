// The per-message LAYERS, named once. A message passes through these in order; each layer is a
// separate concern with its own guarantee, and every layer can be switched off per project
// (ProjectConfig `layers.disabled`) — a project that wants swearing kept turns off `profanity`, a
// project without a model route simply has no model layers. The walk log records one line per
// layer (what came in, what it did, how long), so a miss is attributable to ONE layer.
//
//   deterministic (floors/index.js, runs client-side, no model):
//     reject     prompt-injection / de-anonymisation → the message is not processed
//     signal     the escalation lexicons (crisis · child-safety · medical · abuse · safety · harassment)
//     redact     structured PII (phone, e-mail, IBAN, address, …) → [tokens]
//     names      the name gazetteer → [naam]
//     profanity  the deterministic profanity sweep (and, below, the model decurse pass)
//   model (need a route; run where the channel processes the message):
//     label      the model labels the message for a signal the lexicons cannot see (child placed
//                out of home, …) — additive to `signal`, never overrides a deterministic hit
//     identifier the identifier pass (leftover names, "only-X", disguised PII)
//     profanity  the decurse pass (same switch as the deterministic sweep: one concern, one name)
//
// `shield`/`lang` are plumbing, not policy — always on, not listed.

export const LAYERS = Object.freeze(['reject', 'signal', 'label', 'redact', 'names', 'profanity', 'identifier']);

/** Normalise a `disabled` list into a predicate. Unknown names throw — a typo must not silently keep a layer on. */
export function layerSwitch(disabled = []) {
  const off = new Set();
  for (const name of disabled || []) {
    if (!LAYERS.includes(name)) throw new Error(`unknown layer "${name}" (known: ${LAYERS.join(', ')})`);
    off.add(name);
  }
  return { on: (name) => !off.has(name), disabled: [...off] };
}

/** Time one layer and append a trace line: { layer, ms, ...summary }. `summary` is what the walk log shows. */
export function traced(trace, layer, fn) {
  const t0 = Date.now();
  const out = fn();
  trace.push({ layer, ms: Date.now() - t0, ...(out?.summary || {}) });
  return out?.value;
}
