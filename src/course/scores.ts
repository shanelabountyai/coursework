/**
 * Score text for the gradebook screen. A score is typed as a percent with at most two decimals and
 * stored as integer hundredths of a percent (hp, S2) — parsed digit by digit, never through a float
 * (non-negotiable 4). Display is the reverse, also on integers.
 */
import { Refused } from '@/core/errors';

const PERCENT = /^\s*(\d{1,3})(?:\.(\d{1,2}))?\s*%?\s*$/;
export const MAX_SCORE_HP = 10000;

export function parsePercentHp(text: string): number {
  const m = PERCENT.exec(text);
  if (!m) throw new Refused('Enter a percent like 79.5 or 79.50 (at most two decimals).');
  const hp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (hp > MAX_SCORE_HP) throw new Refused('A score is at most 100.00%.');
  return hp;
}

/** 7950 → "79.50". */
export function hpText(hp: number): string {
  const sign = hp < 0 ? '-' : '';
  const a = Math.abs(hp);
  return `${sign}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** 4444 bp → "44.44%". */
export const bpText = (bp: number) => `${hpText(bp)}%`;
