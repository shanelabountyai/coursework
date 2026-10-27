// One mapping from a status word to a pill colour, so a status looks the same on every screen. The pill shows the
// existing word unchanged (the e2e spec and a registrar both read it); a readable-label glossary is a later item.
const OK = new Set(['ACCEPT', 'PASSED', 'PASS', 'pass', 'done', 'ACCEPTED', 'PUBLISHED']);
const BAD = new Set(['fail', 'FAIL', 'refused', 'REJECT']);
const WARN = new Set(['GRANDFATHERED', 'NOT_RELEASED', 'Locked', 'locked']);
const INFO = new Set(['IN_PROGRESS', 'available']);

export type Tone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral';

export function toneOf(word: string): Tone {
  if (OK.has(word)) return 'ok';
  if (BAD.has(word) || word.startsWith('REJECT')) return 'bad';
  if (WARN.has(word) || word.startsWith('DROPPED') || word.startsWith('PENALTY')) return 'warn';
  if (INFO.has(word) || word.startsWith('EQUIVALENT') || word.startsWith('WAIVER')) return 'info';
  return 'neutral';
}

export function Pill({ children, tone }: { children: string; tone?: Tone }) {
  return <span className={`pill ${tone ?? toneOf(children)}`}>{children}</span>;
}

export function Bar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.floor((done / total) * 100) : 0;
  return <span className="progress-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>;
}
