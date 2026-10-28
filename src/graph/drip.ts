/**
 * Drip release (R1–R3, D-20). Release day = start day + offset days, inclusive; the event carries
 * its day and no clock is consulted. Checks in this order: enrollment → item → release.
 */
import { addDays, daysFromCivil, type Day } from './days';
import type { Code } from './types';

export interface ContentItem {
  code: string;
  title?: string;
  offset_days: number;
}
export interface Enrollment {
  learner_id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | string;
}
export interface Cohort {
  id: string;
  course: Code;
  start_day: Day;
  scheme: string | null;
  catalog_version?: string;
  items: ContentItem[];
  enrolled: Enrollment[];
}

export interface ItemCompletionEvent {
  learner: string;
  cohort: string;
  item: string;
  day: Day;
}

export type DripVerdict = 'ACCEPT' | 'REJECT:NOT_ENROLLED' | 'REJECT:UNKNOWN_ITEM' | 'REJECT:NOT_RELEASED';

/** R1: the day an item becomes available, inclusive. Throws on an unknown item code (callers check R3 first). */
export function releaseDay(cohort: Cohort, itemCode: string): Day {
  const item = cohort.items.find((i) => i.code === itemCode);
  if (!item) throw new Error(`releaseDay: ${cohort.id} has no item ${itemCode}`);
  return addDays(cohort.start_day, item.offset_days);
}

/** `enrolled` answers "is this learner enrolled in this cohort"; the eval builds it from cohorts[].enrolled. */
export function checkItemCompletion(ev: ItemCompletionEvent, cohorts: ReadonlyMap<string, Cohort>, enrolled: (learner: string, cohort: string) => boolean): DripVerdict {
  const cohort = cohorts.get(ev.cohort);
  if (!cohort || !enrolled(ev.learner, ev.cohort)) return 'REJECT:NOT_ENROLLED';
  if (!cohort.items.some((i) => i.code === ev.item)) return 'REJECT:UNKNOWN_ITEM';
  if (daysFromCivil(ev.day) < daysFromCivil(releaseDay(cohort, ev.item))) return 'REJECT:NOT_RELEASED';
  return 'ACCEPT';
}

/** P1: course progress for an enrollment = accepted distinct items / items, as bp, floor. */
export function courseProgressBp(itemsDone: number, itemsTotal: number): number {
  if (itemsTotal <= 0) throw new Error('courseProgressBp: a cohort with no items has no progress');
  return Math.floor((itemsDone * 10000) / itemsTotal);
}
