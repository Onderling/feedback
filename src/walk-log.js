// walk-log — one JSON line per event, for reading a live walk afterwards instead of retelling it.
//
// OFF unless FP_WALK_LOG names a file. Events: `run` (what this process IS: model, route, project),
// `turn` (inbound text → action kind → replies), `llm` (model, task, ms, tokens, ok). Chat ids are
// shortened; text is what the participant typed, so treat the file as private scratch and delete it
// after the walk — it is a debugging aid, not a record.
import { appendFileSync } from 'node:fs';
const FILE = () => (typeof process !== 'undefined' && process.env ? process.env.FP_WALK_LOG : undefined);
export function walkLog(entry) {
  const f = FILE(); if (!f) return;
  try { appendFileSync(f, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'); } catch { /* never break a turn */ }
}
export const walkLogOn = () => Boolean(FILE());
export const shortChat = (id) => String(id ?? '').slice(-4);
