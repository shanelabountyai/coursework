// D-58: the template's org lists (/onboarding, /demo) call filterListedOrgs; archived orgs are hidden, live ones kept.
import { beforeEach, expect, it } from 'vitest';
import { db } from '@/core/db';
import { filterListedOrgs } from '@/app/org-hooks';
import { archiveOrg } from '@/course/archive';
import { resetAuthTables } from '../helpers/auth';

beforeEach(resetAuthTables);

it('hides an archived org and keeps a live one', async () => {
  const live = await db.org.create({ data: { slug: 'live', name: 'Live' } });
  const old = await db.org.create({ data: { slug: 'old', name: 'Old' } });
  await archiveOrg({ orgId: old.id, userId: null }, 'closed');
  const out = await filterListedOrgs('u', [live, old].map((o) => ({ id: o.id, slug: o.slug, name: o.name })));
  expect(out.map((o) => o.slug)).toEqual(['live']);
});
