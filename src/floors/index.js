// The DETERMINISTIC FLOORS as one standalone, browser-runnable module.
//
// These are the LLM-free guarantees that must run CLIENT-SIDE, before any text
// reaches the LLM route — on the participant's device for basis (so even
// the TEE sees only floored, shielded text), and in the bot service for the TG
// route. See feedback-pipeline-build-proposal-en.md §3.
//
// The extractable unit is this file plus the pure modules it re-exports
// (redact, names, decurse, signals, categories, lang, util) — none of which
// import Node APIs (`node:*`, fs, process) or the LLM client, so the set lifts
// cleanly into a shared package (e.g. packages/feedback-floors) later. Its only
// third-party dep is `eld` (browser-safe) for language detection.
//
// One entry point — `floorMessage()` — does the whole client-side floor pass;
// the individual primitives are re-exported for callers that want pieces (e.g.
// `unshield` to restore tokens after the LLM nuance pass).

import { redact } from '../redact.js';
import { redactNames } from '../names.js';
import { decurseDeterministic, hasProfanity } from '../decurse.js';
import { resolveLang, detectLang } from '../lang.js';
import {
  escalationCategory, sensitiveCategory, rejectReason,
  detectPromptInjection, detectDeanonRequest, ESCALATION_CATEGORIES,
} from '../categories.js';
import {
  detectCrisis, detectSafety, detectReident, detectSensitiveContent,
  detectContactRequest, sensitivityFlags, isSensitiveDomain,
} from '../signals.js';
import { shield, unshield } from '../util.js';
import { layerSwitch, traced } from '../layers.js';

/**
 * Run the full deterministic floor pass on ONE raw message, client-side.
 *
 * Order: reject-check → signal/sensitive detection (on RAW, most faithful) →
 * structured-PII redaction → name redaction → deterministic de-cursing →
 * token-shielding → language detection. The result's `shielded` text is what
 * goes to the LLM nuance pass; restore tokens afterwards with `unshield`.
 *
 * @param {string} text
 * @param {{ userDefault?: 'nl'|'en', fallback?: 'nl'|'en', layers?: { disabled?: string[] } }} [opts]
 * @returns {{
 *   reject: string|null,            // a rejectReason (attack) → do not process
 *   lang: 'nl'|'en',
 *   signal: {category:string, via:string}|null,   // escalation category (signal track)
 *   sensitive: string|null,         // integrity | discrimination | retaliation
 *   flags: { reident:boolean, sensitiveContent:boolean, contact:boolean },
 *   floored: string,                // PII + names + profanity removed (deterministic)
 *   shielded: string,               // floored text with tokens shielded, for the LLM
 *   shieldMap: object,              // restore map for unshield()
 *   hits: Array<{type:string, value:string}>,     // PII/name hits, for audit
 *   trace: Array<{layer:string, ms:number}>,      // one line per layer (src/layers.js) — the walk log's view
 * }}
 */
export function floorMessage(text, opts = {}) {
  const raw = String(text ?? '');
  const on = layerSwitch(opts.layers?.disabled).on;
  const trace = [];   // one line per layer — the walk log's per-layer view; a skipped layer is recorded as skipped

  // 1. attack? (prompt-injection / de-anonymisation) — reject before processing
  const reject = traced(trace, 'reject', () => on('reject')
    ? (() => { const r = rejectReason(raw) || null; return { value: r, summary: { rejected: Boolean(r) } }; })()
    : { value: null, summary: { skipped: true } });

  // 2. signal + sensitivity detection on the RAW text (cleaning can generalise
  //    away the give-away phrasing, so detect first)
  const signal = traced(trace, 'signal', () => on('signal')
    ? (() => { const sg = escalationCategory(raw); return { value: sg, summary: { signal: sg?.category ?? null, via: sg?.via ?? null } }; })()
    : { value: null, summary: { skipped: true } });
  const sensitive = sensitiveCategory(raw) || null; // string | null
  const flags = {
    reident: detectReident(raw).isReident,
    sensitiveContent: detectSensitiveContent(raw).isSensitive,
    contact: detectContactRequest(raw).isContact,
  };

  // 3. deterministic redaction: structured PII → names → profanity
  const hits = [];
  const r1 = traced(trace, 'redact', () => on('redact')
    ? (() => { const r = redact(raw); hits.push(...r.hits); return { value: r.text, summary: { hits: r.hits.map((h) => h.type) } }; })()
    : { value: raw, summary: { skipped: true } });
  const r2 = traced(trace, 'names', () => on('names')
    ? (() => { const r = redactNames(r1); hits.push(...r.hits); return { value: r.text, summary: { names: r.hits.length } }; })()
    : { value: r1, summary: { skipped: true } });
  const floored = traced(trace, 'profanity', () => on('profanity')
    ? (() => { const before = r2; const t = decurseDeterministic(before).text; return { value: t, summary: { swept: t !== before } }; })()
    : { value: r2, summary: { skipped: true } });

  // 4. shield tokens so the downstream LLM cannot touch or reconstruct them
  const { shielded, map } = shield(floored);

  // 5. language for routing to the monolingual clean prompt
  const lang = resolveLang({ text: raw, userDefault: opts.userDefault, fallback: opts.fallback }).lang;

  return { reject, lang, signal, sensitive, flags, floored, shielded, shieldMap: map, hits, trace };
}

/** Restore shielded tokens after the LLM nuance pass. */
export const restore = unshield;

// ── primitives (for callers that want pieces) ──────────────────────
export {
  redact, redactNames, decurseDeterministic, hasProfanity,
  detectLang, resolveLang,
  escalationCategory, sensitiveCategory, rejectReason,
  detectPromptInjection, detectDeanonRequest, ESCALATION_CATEGORIES,
  detectCrisis, detectSafety, detectReident, detectSensitiveContent,
  detectContactRequest, sensitivityFlags, isSensitiveDomain,
  shield, unshield,
};
