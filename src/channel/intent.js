// Natural-language intent classification for the basis surface (free text, no slash
// commands). basis historically let participants type naturally and an LLM mapped
// intent; this is that layer. Hybrid, in the floors spirit: a deterministic fast-path for
// short, unambiguous control utterances, then the LLM (the app's own route — local /
// Privatemode / OVH via src/ollama.js) for the rest, defaulting to "it's feedback content".
//
// Returns an action in the shared shape (see actions.js). The DEFAULT is always
// { kind: 'message' } — feedback content is the common case and the safe fallback (the
// participant reviews before anything is shared anyway).

import { chat } from '../ollama.js';

// ANCHORED, near-exact control phrases: a match means the WHOLE short message is the
// command, so a feedback message that merely contains a keyword ("stop met dit beleid",
// "bekijk dit probleem") is left to the LLM/default, not mistaken for a command.
const DET = [
  [/^(\/)?(bekijk|klaar|done|review|ik ben klaar|ben klaar|laat (het |me )?(maar )?zien|i'?m done)[.!\s]*$/i, () => ({ kind: 'review' })],
  [/^(?:\/)?(?:bekijk|laat (?:me |mij )?zien|toon|show)\s+(?:mijn |m'n |my )?punten[.!?\s]*$/i, () => ({ kind: 'review' })],
  [/^(verstuur|stuur|send|submit|deel)\s+(alles|all|ze allemaal|everything)[.!\s]*$/i, () => ({ kind: 'consent', all: true })],
  [/^(alles|allemaal|all|everything)\s+(versturen|verstuur|sturen|send|delen|submit)[.!\s]*$/i, () => ({ kind: 'consent', all: true })],
  [/^(niets( versturen| te delen)?|nothing|annuleer|cancel|laat maar( zitten)?)[.!\s]*$/i, () => ({ kind: 'cancel' })],
  [/^(menu|help|\?)[.!\s]*$/i, () => ({ kind: 'menu' })],
  [/^(?:toon|laat|zie|bekijk|show|view|geef)?\s*(?:mijn bijdragen|my contributions|wat heb ik (?:verstuurd|gedeeld)|what did i (?:send|submit|share))(?:\s+zien)?[?.!\s]*$/i, () => ({ kind: 'my-contributions' })],
  // edit a point by number ("bewerk punt 2", "verander punt 2", "edit 2", "change point 2") → opens its editor.
  [/^(?:bewerk|verander|wijzig|pas|edit|change)\s+(?:punt\s+|point\s+)?(\d+)\s*(?:aan)?[.!?\s]*$/i, (m) => ({ kind: 'edit-point', id: `p${m[1]}` })],
  // delete-all ("verwijder alles", "wis al mijn bijdragen", "delete everything", "clear all") → ASK (guarded).
  [/^(?:\/)?(?:verwijder|wis|delete|clear)\s+(?:alles|alle|all|everything|(?:al\s+)?(?:mijn|m'n|my)\s+(?:bijdragen|contributions))[.!?\s]*$/i, () => ({ kind: 'delete-all' })],
];

// "Is this feedback at all?" — a greeting, thanks, an ok, a test is small talk, NOT a point (the walk-2 "Moi"
// became a stored point). Anchored + short: a real message that merely starts with "hoi" is longer than this.
const SMALLTALK = /^(?:(?:hoi|hallo|hallo daar|hi|hey|hé|he|moi|yo|goedemorgen|goedemiddag|goedenavond|goeiemorgen|goedendag|dag|hello|good morning|good afternoon|good evening)(?:\s+(?:allemaal|daar|there|bot|iedereen))?|(?:dank(?:je|u)?(?:\s*wel)?|bedankt|thanks|thank you|thx|merci)(?:\s+(?:bot|hoor|je wel))?|(?:ok(?:é|e|ay)?|oké|top|prima|goed|fijn|mooi|super|helder|duidelijk|snap ik|is goed|ok dan|got it|great|cool|nice|fine)|(?:test|testje|testing|ping|hallo\?|werkt dit\??|werk je\??|ben je er\??|are you there\??))[.!?\s]*$/i;
export function isSmalltalk(text) {
  const t = (text || '').trim();
  return t.length > 0 && t.split(/\s+/).length <= 4 && SMALLTALK.test(t);
}

function deterministicIntent(text) {
  if (text.split(/\s+/).filter(Boolean).length > 6) return null;   // long → content; LLM/default decides
  for (const [re, make] of DET) { const m = text.match(re); if (m) return make(m); }
  if (isSmalltalk(text)) return { kind: 'smalltalk' };
  return null;
}

const SYS = [
  'You classify a participant message in a civic feedback tool. The participant either sends',
  'FEEDBACK CONTENT (an opinion/experience to collect) or gives an INSTRUCTION about the tool.',
  'Respond with ONLY a JSON object, no prose:',
  '{"intent":"message|smalltalk|review|consent_all|consent_one|my_contributions|menu|cancel","index":<number optional>}',
  '- message: the text is feedback content — an opinion, complaint, experience, suggestion, question about a situation (DEFAULT when unsure).',
  '- smalltalk: ONLY a greeting, thanks, an acknowledgement, a test ("hoi", "dankjewel", "werkt dit?") — nothing to collect. Never for text that describes anything.',
  '- review: they want to see/check the points of THIS conversation before sending ("I\'m done", "let me see what I said so far").',
  '- consent_all: send/share all their points.',
  '- consent_one: send one specific point; include its 1-based "index" if stated.',
  '- my_contributions: show what they already SENT/submitted earlier (the word sent/opgestuurd/verstuurd/gedeeld).',
  '- menu / cancel: show options / send nothing.',
].join('\n');

function actionFor(obj, text) {
  switch (obj?.intent) {
    case 'review': return { kind: 'review' };
    case 'consent_all': return { kind: 'consent', all: true };
    case 'consent_one': return Number.isInteger(obj.index) ? { kind: 'consent', index: obj.index } : { kind: 'review' };
    case 'my_contributions': return { kind: 'my-contributions' };
    case 'menu': return { kind: 'menu' };
    case 'cancel': return { kind: 'cancel' };
    case 'smalltalk': return { kind: 'smalltalk' };
    case 'message': return { kind: 'message', text };
    default: return null;
  }
}

/**
 * @param {string} text
 * @param {{ model?:string }} [opts]   model enables the LLM step; omit for deterministic-only
 * @returns {Promise<object>} an action ({ kind, ... })
 */
export async function classifyIntent(text, { model } = {}) {
  const t = (text || '').trim();
  if (!t) return { kind: 'message', text: t };

  const det = deterministicIntent(t);
  if (det) return det;

  if (model) {
    const r = await chat(model, SYS, t, { numPredict: 40 });
    if (r.ok) {
      const m = r.text.match(/\{[\s\S]*\}/);
      if (m) { try { return actionFor(JSON.parse(m[0]), t) || { kind: 'message', text: t }; } catch { /* fall through */ } }
    }
  }
  return { kind: 'message', text: t };   // safe default: feedback content
}
