// GG-01..GG-09 and the task 1.5 acceptance over all 15 draft edits. Inputs come from fixtures/
// (tests read fixtures; the generator is never imported).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogHash } from '@/graph/canonical';
import { cyclicComponents, cyclePath, edgeCount, prereqEdges, topoOrder } from '@/graph/dag';
import { leaves, validateExpr } from '@/graph/expr';
import { applyEdit, validateCatalog, type DraftEdit } from '@/graph/publish';
import { courseMap, type Catalog } from '@/graph/types';
import { readCsv } from '../../scripts/lib/csv';

const catalog: Catalog = JSON.parse(readFileSync('fixtures/catalog.json', 'utf8'));
const edits: DraftEdit[] = JSON.parse(readFileSync('fixtures/draft_edits.json', 'utf8')).edits;
const EDIT = new Map(edits.map((e) => [e.id, e]));
const edit = (id: string) => validateCatalog(applyEdit(catalog, EDIT.get(id)!));
const cyclesOf = (id: string) => edit(id).cycles.map((c) => c.join(' -> '));

const TOPO_V1 =
  'ACC-100 ACC-101 ACC-102 ACC-201 ACC-202 ACC-301 ACC-303 DAT-101 DAT-102 DAT-201 DAT-202 DAT-301 DAT-303 ' +
  'MGT-101 MGT-201 ACC-302 ACC-401 MGT-202 DAT-302 DAT-401 MGT-301 MGT-302 MGT-401 PRJ-101 PRJ-201 PRJ-202 PRJ-301 ' +
  'SEC-100 SEC-101 SEC-201 SEC-202 SEC-301 SEC-302 SEC-401 WRT-101 PRJ-302 PRJ-401 WRT-201 WRT-202 WRT-301';

describe('G1 expressions', () => {
  it('leaves are sorted and deduplicated across ALL and ANY', () => {
    expect(leaves({ all: ['B', { any: ['A', 'B'] }] })).toEqual(['A', 'B']);
    expect(leaves(null)).toEqual([]);
    expect(leaves('X')).toEqual(['X']);
  });
  it('reports each shape error with the oracle wording; a self-reference is not an expression error', () => {
    const known = new Set(['A', 'B']);
    expect(validateExpr('C', 'Z', known)).toEqual([{ code: 'PREREQ_UNKNOWN', detail: 'C requires unknown Z' }]);
    expect(validateExpr('C', 'C', known)).toEqual([]);
    expect(validateExpr('C', { all: [] }, known)).toEqual([{ code: 'PREREQ_EMPTY_GROUP', detail: 'C: empty all group' }]);
    expect(validateExpr('C', { any: [{ any: ['A'] }] }, known)).toEqual([{ code: 'PREREQ_SAME_KIND', detail: 'C: any nested directly inside any' }]);
    expect(validateExpr('C', { all: ['A', { any: ['B', { all: ['A'] }] }] }, known)).toEqual([{ code: 'PREREQ_DEPTH', detail: 'C: group nested deeper than 2' }]);
    expect(validateExpr('C', { or: ['A'] }, known)).toEqual([{ code: 'PREREQ_SHAPE', detail: 'C: group must be {"all":[..]} or {"any":[..]}' }]);
    expect(validateExpr('C', 7, known)).toEqual([{ code: 'PREREQ_SHAPE', detail: 'C: group must be {"all":[..]} or {"any":[..]}' }]);
    expect(validateExpr('C', { all: ['A', 'Q'], any: ['B'] }, known)).toEqual([{ code: 'PREREQ_SHAPE', detail: 'C: group must be {"all":[..]} or {"any":[..]}' }]);
  });
});

describe('G2–G5 on cat-v1', () => {
  it('GG-01: cat-v1 publishes; 40 courses, 56 edges, no cycles', () => {
    const v = validateCatalog(catalog);
    expect(v.result).toBe('ACCEPT');
    expect(v.cycles).toEqual([]);
    expect(catalog.courses).toHaveLength(40);
    expect(edgeCount(courseMap(catalog))).toBe(56);
  });
  it('GG-01: topological order with the lexical tiebreak', () => {
    expect(topoOrder(prereqEdges(courseMap(catalog))).join(' ')).toBe(TOPO_V1);
  });
  it('GG-02: E-01 2-cycle', () => {
    expect(edit('E-01').result).toBe('REJECT:CYCLE');
    expect(cyclesOf('E-01')).toEqual(['ACC-101 -> ACC-201 -> ACC-101']);
  });
  it('GG-03: E-02 3-cycle closed through one ANY branch', () => {
    expect(cyclesOf('E-02')).toEqual(['MGT-101 -> MGT-201 -> MGT-301 -> MGT-101']);
  });
  it('GG-04: E-03 self-reference is a 1-cycle', () => {
    expect(edit('E-03').result).toBe('REJECT:CYCLE');
    expect(cyclesOf('E-03')).toEqual(['SEC-202 -> SEC-202']);
  });
  it('GG-05: E-06 an ANY branch that closes a cycle is still a cycle', () => {
    expect(cyclesOf('E-06')).toEqual(['ACC-301 -> ACC-401 -> ACC-301']);
  });
  it('GG-06: E-14 two cycles, smallest member first', () => {
    expect(cyclesOf('E-14')).toEqual(['ACC-101 -> ACC-202 -> ACC-101', 'WRT-101 -> WRT-201 -> WRT-101']);
  });
  it('GG-07: E-13 diamond closed', () => {
    expect(cyclesOf('E-13')).toEqual(['DAT-201 -> DAT-202 -> DAT-201']);
  });
  it('GG-08: E-05 published course requiring a DRAFT; E-12 retiring WRT-101 names every dependent', () => {
    expect(edit('E-05').result).toBe('REJECT:PREREQ_UNPUBLISHED');
    expect(edit('E-12').errors.map((e) => e.detail)).toEqual(['PRJ-302 requires WRT-101 (RETIRED)', 'WRT-201 requires WRT-101 (RETIRED)', 'WRT-202 requires WRT-101 (RETIRED)']);
  });
  it('GG-09: E-08 / E-09 / E-10 rejected by stage 0; E-07 / E-11 / E-15 accepted', () => {
    expect(['E-08', 'E-09', 'E-10'].map((e) => edit(e).result)).toEqual(['REJECT:PREREQ_UNKNOWN', 'REJECT:PREREQ_DEPTH', 'REJECT:PREREQ_EMPTY_GROUP']);
    expect(['E-07', 'E-11', 'E-15'].map((e) => edit(e).result)).toEqual(['ACCEPT', 'ACCEPT', 'ACCEPT']);
  });
  it('GG-20: E-15 changes the content hash; applyEdit never mutates its input', () => {
    const before = JSON.stringify(catalog);
    const next = applyEdit(catalog, EDIT.get('E-15')!);
    expect(catalogHash(next)).not.toBe(catalogHash(catalog));
    expect(next.courses).toHaveLength(41);
    expect(JSON.stringify(catalog)).toBe(before);
  });
  it('a stage-0 error on a different course does not hide a cycle: both are listed, headline is the first stage', () => {
    const both = applyEdit(applyEdit(catalog, EDIT.get('E-01')!), EDIT.get('E-08')!);
    const v = validateCatalog(both);
    expect(v.result).toBe('REJECT:PREREQ_UNKNOWN');
    expect(v.errors.map((e) => e.code)).toEqual(['PREREQ_UNKNOWN', 'CYCLE']);
  });
  it('unknown equivalency and certificate codes are stage-0 errors', () => {
    const v = validateCatalog({ ...catalog, equivalencies: [{ satisfies: 'ACC-101', by: 'NOPE', reason: 'x' }], certificates: [{ code: 'CERT-X', title: 'x', courses: ['ZZZ'] }] });
    expect(v.errors).toEqual([
      { code: 'CERT_UNKNOWN', detail: 'CERT-X lists unknown ZZZ' },
      { code: 'EQUIV_UNKNOWN', detail: 'equivalency NOPE -> ACC-101: unknown NOPE' },
    ]);
  });
  it('cyclePath on a hand-built component reports the BFS cycle from the smallest member', () => {
    const succ = new Map<string, string[]>([
      ['A', ['B', 'C']],
      ['B', ['A']],
      ['C', ['D']],
      ['D', ['A']],
    ]);
    expect(cyclicComponents(succ)).toEqual([['A', 'B', 'C', 'D']]);
    expect(cyclePath(['A', 'B', 'C', 'D'], succ)).toEqual(['A', 'B', 'A']);
  });
});

describe('all 15 draft edits against expected_edits.csv (result, cycles, errors)', () => {
  const rows = readCsv(readFileSync('fixtures/expected_edits.csv', 'utf8'));
  expect(rows).toHaveLength(15);
  for (const row of rows) {
    it(`${row.edit_id} ${row.result}`, () => {
      const v = edit(row.edit_id!);
      expect(v.result).toBe(row.result);
      expect(v.cycles.map((c) => c.join(' -> ')).join(';')).toBe(row.cycles);
      expect(v.errors.map((e) => `${e.code}:${e.detail}`).join(';')).toBe(row.errors);
    });
  }
});
