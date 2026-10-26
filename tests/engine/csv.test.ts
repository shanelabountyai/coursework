// The owned CSV reader must read what Python's csv.DictWriter wrote, quoted commas included.
import { describe, expect, it } from 'vitest';
import { parseCsv, readCsv, writeCsv } from '../../scripts/lib/csv';

describe('scripts/lib/csv', () => {
  it('reads quoted commas, doubled quotes and a trailing newline like csv.DictReader', () => {
    const text = 'scheme,errors\nSCH-BAD,"WEIGHTS_SUM:weights sum to 9900, not 10000"\nX,"say ""hi"""\nY,\n';
    expect(readCsv(text)).toEqual([
      { scheme: 'SCH-BAD', errors: 'WEIGHTS_SUM:weights sum to 9900, not 10000' },
      { scheme: 'X', errors: 'say "hi"' },
      { scheme: 'Y', errors: '' },
    ]);
  });
  it('round-trips through writeCsv with minimal quoting', () => {
    const rows = [{ a: 'plain', b: 'with, comma' }, { a: 'q"q', b: '' }];
    const text = writeCsv(rows, ['a', 'b']);
    expect(text).toBe('a,b\nplain,"with, comma"\n"q""q",\n');
    expect(readCsv(text)).toEqual(rows);
  });
  it('refuses a ragged row and an unterminated quote', () => {
    expect(() => readCsv('a,b\n1\n')).toThrow(/row 2 has 1 fields/);
    expect(() => parseCsv('a\n"open')).toThrow(/unterminated/);
  });
  it('handles CRLF and an empty file', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(readCsv('')).toEqual([]);
  });
});
