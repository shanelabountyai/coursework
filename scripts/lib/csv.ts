/**
 * A small RFC 4180 reader and writer, owned here (CSV library is on the ask-before-add list, D-9).
 * Reads what Python's csv.DictWriter wrote: `,` separator, `"` quoting with `""` escapes, `\n` rows,
 * header in the first row. Fields are strings; callers parse integers where the column is numeric.
 */

export type Row = Record<string, string | undefined>;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  let sawAny = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          quoted = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      sawAny = true;
      i++;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      sawAny = true;
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawAny = false;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      sawAny = true;
      i++;
    }
  }
  if (quoted) throw new Error('csv: unterminated quoted field');
  if (sawAny || field.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Header row → objects. Every data row must have the header's width; a ragged file is an error, not a guess. */
export function readCsv(text: string): Row[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((cells, idx) => {
    if (cells.length !== header.length) throw new Error(`csv: row ${idx + 2} has ${cells.length} fields, header has ${header.length}`);
    const r: Row = {};
    header.forEach((h, j) => (r[h] = cells[j]));
    return r;
  });
}

function quote(v: string): string {
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** Writes like Python's csv.DictWriter(lineterminator="\n"): minimal quoting, trailing newline. */
export function writeCsv(rows: readonly Row[], cols: readonly string[]): string {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => quote(r[c] ?? '')).join(','));
  return lines.join('\n') + '\n';
}
