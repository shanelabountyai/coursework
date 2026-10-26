/**
 * Canonical JSON and the catalog content hash (V1, D-15). Written fresh from the brief (D-36):
 * Adjuster's `src/rules/canonical.ts` was not reachable from the cloud. Agrees with
 * `tools/courselib.py` `canonical()` = `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`:
 *   - object keys sorted; Python sorts by code point and JS by UTF-16 unit, which agree on ASCII, so
 *     a non-ASCII key is refused rather than hashed differently on the two sides;
 *   - no whitespace; `null`, booleans, integers and strings only; a non-integer number is refused
 *     because Python's `repr(float)` and JS's `Number#toString` do not share a canonical text;
 *   - string escaping is JSON.stringify's, which equals Python's with ensure_ascii=False for every
 *     well-formed string (both escape only `"`, `\` and U+0000..U+001F).
 * Deterministic and library-free apart from node:crypto's SHA-256.
 */
import { createHash } from 'node:crypto';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonical(value: Json): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) throw new Error(`canonical: non-integer number ${String(value)} has no canonical form (D-36)`);
      return String(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
      const keys = Object.keys(value).sort();
      for (const k of keys) {
        // eslint-disable-next-line no-control-regex
        if (!/^[\x00-\x7f]*$/.test(k)) throw new Error(`canonical: non-ASCII key ${JSON.stringify(k)} would sort differently in Python (D-36)`);
      }
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k] as Json)).join(',') + '}';
    }
    default:
      throw new Error(`canonical: unsupported value of type ${typeof value}`);
  }
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** V1: SHA-256 of the canonical JSON of {certificates, courses, equivalencies}; the version label is outside the hash. */
export function catalogHash(catalog: { courses: Json; equivalencies: Json; certificates: Json }): string {
  return sha256Hex(canonical({ courses: catalog.courses, equivalencies: catalog.equivalencies, certificates: catalog.certificates }));
}
