/**
 * Reading catalog versions back as the engine's `Catalog`. The stored content is the hashed body
 * {courses, equivalencies, certificates} (V1); the label lives in its own column, outside the hash.
 */
import { db } from '@/core/db';
import type { Prisma } from '@/generated/prisma/client';
import { catalogHash } from '@/graph/canonical';
import type { Catalog } from '@/graph/types';

export type Tx = Prisma.TransactionClient;
export type VersionRow = { id: string; orgId: string; label: string; hash: string; content: Prisma.JsonValue; parentId: string | null };

export type CatalogContent = Pick<Catalog, 'courses' | 'equivalencies' | 'certificates'>;

/** The hashed body of a catalog: label and any stored hash stripped. */
export function contentOf(catalog: Catalog | CatalogContent): CatalogContent {
  return { courses: catalog.courses, equivalencies: catalog.equivalencies ?? [], certificates: catalog.certificates ?? [] };
}

/** The engine's view of a stored version. Throws if the stored hash no longer matches the content (a tampered or mis-written row). */
export function catalogOf(row: VersionRow): Catalog {
  const content = row.content as unknown as CatalogContent;
  const hash = catalogHash(content);
  if (hash !== row.hash) throw new Error(`CatalogVersion ${row.label} (${row.id}): stored hash ${row.hash} != content hash ${hash}`);
  return { version: row.label, ...contentOf(content), hash };
}

export async function loadVersion(versionId: string, tx: Tx = db): Promise<{ row: VersionRow; catalog: Catalog }> {
  const row = await tx.catalogVersion.findUniqueOrThrow({ where: { id: versionId } });
  return { row, catalog: catalogOf(row) };
}

export async function versionByLabel(orgId: string, label: string, tx: Tx = db): Promise<{ row: VersionRow; catalog: Catalog }> {
  const row = await tx.catalogVersion.findUniqueOrThrow({ where: { orgId_label: { orgId, label } } });
  return { row, catalog: catalogOf(row) };
}
