import { moduleExportTables } from '@/app/modules';
import type { ExportTable } from '@/core/tenancy/export';

// Clone-owned (v1.6.0), like org-hooks.ts: which tables a data export holds beyond the template's core ones
// (addendum §5). Add one entry per org-owned table, selecting only columns that are safe to hand over: never a
// sealed column, token hash or recovery code (INV-34 scans the output). Every query runs inside withOrg.
//   { name: 'Booking', rows: (tx, orgId) => tx.booking.findMany({ where: { orgId }, select: { id: true, startsAt: true } }) },
// Coursework (D-73): every org-owned table, all columns. The only omissions are the two sha256 columns
// (CatalogVersion.hash, GradeScheme.hash): recomputable from `content`, and INV-34 rejects any 64-hex value.
export const exportTables: readonly ExportTable[] = [
  ...moduleExportTables,
  { name: 'CatalogVersion', rows: (tx, orgId) => tx.catalogVersion.findMany({ where: { orgId }, omit: { hash: true } }) },
  { name: 'PublishAttempt', rows: (tx, orgId) => tx.publishAttempt.findMany({ where: { orgId } }) },
  { name: 'CatalogDraft', rows: (tx, orgId) => tx.catalogDraft.findMany({ where: { orgId } }) },
  { name: 'Learner', rows: (tx, orgId) => tx.learner.findMany({ where: { orgId } }) },
  { name: 'Waiver', rows: (tx, orgId) => tx.waiver.findMany({ where: { orgId } }) },
  { name: 'CompletionEvent', rows: (tx, orgId) => tx.completionEvent.findMany({ where: { orgId } }) },
  { name: 'GradeScheme', rows: (tx, orgId) => tx.gradeScheme.findMany({ where: { orgId }, omit: { hash: true } }) },
  { name: 'Cohort', rows: (tx, orgId) => tx.cohort.findMany({ where: { orgId }, include: { items: true, assignments: true } }) },
  { name: 'Enrollment', rows: (tx, orgId) => tx.enrollment.findMany({ where: { orgId } }) },
  { name: 'ItemCompletion', rows: (tx, orgId) => tx.itemCompletion.findMany({ where: { orgId } }) },
  { name: 'Submission', rows: (tx, orgId) => tx.submission.findMany({ where: { orgId } }) },
  { name: 'OrgArchive', rows: (tx, orgId) => tx.orgArchive.findMany({ where: { orgId } }) },
];

// An org-owned table left out on purpose, with the reason. INV-34 fails on any model with an orgId column that is in
// neither list, so a new table cannot silently drop out of every export.
export const exportSkipped: Readonly<Record<string, string>> = {};
