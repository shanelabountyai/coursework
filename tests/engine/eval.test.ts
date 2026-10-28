// course:eval and progress:verify as library calls: the §8 report equals both reference outputs line for
// line, the seven tables diff clean, a planted one-row change is a diff, and dropping one accepted item
// event moves exactly one enrollment progress value (task 1.9 / 1.10 acceptance).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLUMNS, certificateRows, diffRows, dripVerdicts, enrollmentProgressRows, EXPECTED_FILES, runEval, type EvalTables } from '../../scripts/lib/eval';
import { learnerStates, loadExpected, loadFixtures } from '../../scripts/lib/fixtures';

const fx = loadFixtures();
const result = runEval(fx);
const nonBlank = (lines: string[]) => lines.filter((l) => l !== '' && !l.startsWith('wrote '));

describe('course:eval', () => {
  it('prints reference_graph.output.txt and reference_grades.output.txt line for line', () => {
    const want = [...nonBlank(readFileSync('fixtures/samples/reference_graph.output.txt', 'utf8').split('\n')), ...nonBlank(readFileSync('fixtures/samples/reference_grades.output.txt', 'utf8').split('\n'))];
    expect(nonBlank(result.lines)).toEqual(want);
  });
  it('0 diffs over all seven expected_*.csv; row counts 15 / 10,800 / 300 / 2,051 / 341 / 3 / 106; max 16 combinations', () => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(EXPECTED_FILES) as (keyof EvalTables)[]) {
      const want = loadExpected(fx.dir, EXPECTED_FILES[key]);
      expect(diffRows(result.tables[key], want, COLUMNS[key])).toEqual([]);
      counts[key] = result.tables[key].length;
    }
    expect(counts).toEqual({ edits: 15, eligibility: 10800, progress: 300, drip: 2051, enrollmentProgress: 341, schemes: 3, grades: 106 });
    expect(result.maxCombinations).toBe(16);
  });
  it('a planted one-row change in an expected file is reported as exactly one diff, naming the column', () => {
    const want = loadExpected(fx.dir, 'expected_grades.csv');
    want[0] = { ...want[0], final_hp: '9125' };
    expect(diffRows(result.tables.grades, want, COLUMNS.grades)).toEqual(['row 1 final_hp: computed "9124" expected "9125"']);
    expect(diffRows(result.tables.grades, want.slice(1), COLUMNS.grades)).toHaveLength(106);
  });
});

describe('progress:verify', () => {
  it('derives 341 + 300 progress values from events only and matches the oracle', () => {
    const d = dripVerdicts(fx);
    const ep = enrollmentProgressRows(fx, d.done);
    const cp = certificateRows(fx, learnerStates(fx));
    expect(diffRows(ep.rows, loadExpected(fx.dir, 'expected_enrollment_progress.csv'), COLUMNS.enrollmentProgress)).toEqual([]);
    expect(diffRows(cp.rows, loadExpected(fx.dir, 'expected_progress.csv'), ['learner_id', 'certificate', 'required', 'satisfied', 'progress_bp'])).toEqual([]);
  });
  it('removing one accepted item event moves exactly one enrollment progress value', () => {
    const copy = { ...fx, itemEvents: fx.itemEvents.filter((e) => e.event_id !== 'IE-00001') };
    const d = dripVerdicts(copy);
    expect(d.counts.get('ACCEPT')).toBe(1884);
    const ep = enrollmentProgressRows(copy, d.done);
    expect(diffRows(ep.rows, loadExpected(fx.dir, 'expected_enrollment_progress.csv'), COLUMNS.enrollmentProgress)).toEqual(['row 1 items_done: computed "3" expected "4"']);
  });
  it('removing a REJECTED item event moves nothing: a refused completion never counted', () => {
    const rejected = result.tables.drip.find((r) => r.verdict !== 'ACCEPT')!.event_id!;
    const copy = { ...fx, itemEvents: fx.itemEvents.filter((e) => e.event_id !== rejected) };
    const d = dripVerdicts(copy);
    expect(diffRows(enrollmentProgressRows(copy, d.done).rows, loadExpected(fx.dir, 'expected_enrollment_progress.csv'), COLUMNS.enrollmentProgress)).toEqual([]);
  });
});
