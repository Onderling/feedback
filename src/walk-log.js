// walk-log — one JSON line per event, for reading a live walk afterwards instead of retelling it.
//
// OFF unless FP_WALK_LOG names a file. Events: `run` (what this process IS: model, route, project),
// `turn` (inbound text → action kind → replies), `llm` (model, task, ms, tokens, ok). Chat ids are
// shortened; text is what the participant typed, so treat the file as private scratch and delete it
// after the walk — it is a debugging aid, not a record.
import { appendFileSync } from 'node:fs';
// The file is stamped once per process (walk-<date>_<time>.jsonl next to / instead of the given name), so
// each run reads as its own walk later.
let stamped = null;
const FILE = () => {
  const raw = typeof process !== 'undefined' && process.env ? process.env.FP_WALK_LOG : undefined;
  if (!raw) return undefined;
  if (!stamped) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    stamped = /\/$/.test(raw) ? `${raw}walk-${stamp}.jsonl` : raw.replace(/(\.jsonl)?$/, `-${stamp}$1`);
  }
  return stamped;
};
export const walkLogFile = () => FILE() ?? null;
export function walkLog(entry) {
  const f = FILE(); if (!f) return;
  try { appendFileSync(f, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'); } catch { /* never break a turn */ }
}
export const walkLogOn = () => Boolean(FILE());
export const shortChat = (id) => String(id ?? '').slice(-4);
