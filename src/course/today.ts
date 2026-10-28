/**
 * D-57: THE ONE PLACE an instant becomes a calendar day. A learner's item completion is dated by the
 * server, never by the form (a learner-supplied day could complete an item before its release day, R2).
 * `now()` is the template's injectable clock, so tests move it; the zone is the school's, a constant until
 * an org setting exists. No D-8 banned call: the day comes from Intl's calendar fields, not from a string.
 */
import { now } from '@/core/clock';
import { isDay, type Day } from '@/graph/days';

export const SCHOOL_TIME_ZONE = 'America/Chicago';

/** `epochMs` is milliseconds since the epoch (an instant); Intl formats a number directly, so no Date is built here. */
export function dayInZone(epochMs: number, timeZone: string): Day {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(epochMs);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  if (!isDay(day)) throw new Error(`dayInZone: could not form a day from ${JSON.stringify(parts)}`);
  return day;
}

/** Today at the school. */
export const schoolToday = (): Day => dayInZone(now().getTime(), SCHOOL_TIME_ZONE);
