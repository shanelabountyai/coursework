// GG-20 (catalog content hash) and the task 1.3 acceptance: sorted keys, no whitespace, floats refused.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonical, catalogHash, sha256Hex } from '@/graph/canonical';

const CAT_V1_HASH = '32978f4b386ea7ce1fdf1018f67633def259d08808c501cdedea84c849197e8d';
const catalog = JSON.parse(readFileSync('fixtures/catalog.json', 'utf8'));

describe('canonical JSON (V1, D-36)', () => {
  it('sorts keys and emits no whitespace, like json.dumps(sort_keys=True, separators=(",", ":"))', () => {
    expect(canonical({ b: [1, { d: null, c: 'x' }], a: true })).toBe('{"a":true,"b":[1,{"c":"x","d":null}]}');
  });
  it('escapes like Python with ensure_ascii=False: only quote, backslash and control characters', () => {
    expect(canonical('é "q" \\ \n\t\u0001')).toBe('"é \\"q\\" \\\\ \\n\\t\\u0001"');
  });
  it('refuses a float and a non-ASCII key', () => {
    expect(() => canonical({ x: 1.5 })).toThrow(/non-integer/);
    expect(() => canonical({ x: Number.NaN })).toThrow(/non-integer/);
    expect(() => canonical({ é: 1 })).toThrow(/non-ASCII key/);
  });
  it('GG-20: cat-v1 hashes to 32978f4b… and the stored hash field agrees', () => {
    expect(catalogHash(catalog)).toBe(CAT_V1_HASH);
    expect(catalog.hash).toBe(CAT_V1_HASH);
  });
  it('the label is outside the hash; the content is inside it', () => {
    expect(catalogHash({ ...catalog, version: 'cat-v99' })).toBe(CAT_V1_HASH);
    const courses = [...catalog.courses, { code: 'ACC-203', title: 'x', status: 'DRAFT', prereq: null }];
    expect(catalogHash({ ...catalog, courses })).not.toBe(CAT_V1_HASH);
  });
  it('sha256Hex matches a known vector', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
