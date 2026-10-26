// seed:fixtures — task 2.8. Loads fixtures/ into the database named by DATABASE_URL through the write
// paths (src/course/seed.ts). `--slug <org slug>` (default fixtures-school); `--fixtures <dir>`.
// Refuses if the org exists. Prints the counts; exit 1 on any error.
import { pathToFileURL } from 'node:url';
import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { seedFixtures } from '@/course/seed';
import { loadFixtures } from './lib/fixtures';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fx = loadFixtures(arg('--fixtures') ?? 'fixtures');
  const slug = arg('--slug') ?? 'fixtures-school';
  try {
    const t0 = Date.now();
    const c = await seedFixtures(fx, slug, (s) => console.log(`  ${s}`));
    console.log(`seed:fixtures: org ${slug} (${c.orgId}) version ${c.versionHash.slice(0, 8)}… — courses ${c.courses} / certificates ${c.certificates} / equivalencies ${c.equivalencies} / schemes ${c.schemes} (${c.schemesAccepted} ACCEPT) / learners ${c.learners} / waivers ${c.waivers} / completions ${c.completions} / cohorts ${c.cohorts} / enrollments ${c.enrollments} / item events ${c.itemEvents} (${c.itemsAccepted} rows, ${c.itemEvents - c.itemsAccepted} refused to the audit log) / assignments ${c.assignments} / submissions ${c.submissions}; ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) {
    console.error(`seed:fixtures: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
