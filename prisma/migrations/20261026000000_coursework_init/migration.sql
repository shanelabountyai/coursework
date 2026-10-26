-- Coursework Phase 2, task 2.1/2.2: the clone's own tables (prisma/schema/coursework.prisma) and the
-- append-only triggers. Hand-written: the sandbox cannot run the Prisma schema engine (NEXT.md), so this
-- follows the template's generated SQL conventions line for line; CI applies it from scratch and
-- `prisma migrate diff` there compares it against the schema (task 2.11).
--
-- Days are CHAR(10) calendar strings, never DATE (D-8). No column stores progress (P1).

-- CreateEnum
CREATE TYPE "CompletionKind" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "CatalogVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "content" JSONB NOT NULL,
    "parentId" UUID,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "fromVersionId" UUID NOT NULL,
    "edit" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "errors" JSONB NOT NULL,
    "cycles" JSONB NOT NULL,
    "grandfathered" JSONB NOT NULL,
    "resultVersionId" UUID,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Learner" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "targetCertificate" TEXT NOT NULL,
    "enrolledVersionId" UUID NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Learner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waiver" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "course" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedDay" CHAR(10) NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "course" TEXT NOT NULL,
    "kind" "CompletionKind" NOT NULL,
    "day" CHAR(10) NOT NULL,
    "catalogVersionId" UUID NOT NULL,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "startDay" CHAR(10) NOT NULL,
    "schemeId" UUID,
    "catalogVersionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "cohortId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "offsetDays" INTEGER NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cohortId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "catalogVersionId" UUID NOT NULL,
    "grandfathered" BOOLEAN NOT NULL DEFAULT false,
    "grandfatheredMissing" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCompletion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cohortId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "itemCode" TEXT NOT NULL,
    "day" CHAR(10) NOT NULL,
    "eventRef" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeScheme" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" UUID NOT NULL,
    "cohortId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pointsPossible" INTEGER NOT NULL,
    "dueDay" CHAR(10) NOT NULL,
    "extraCredit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cohortId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "scoreHp" INTEGER NOT NULL,
    "submittedDay" CHAR(10) NOT NULL,
    "supersedesId" UUID,
    "reason" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVersion_orgId_label_key" ON "CatalogVersion"("orgId", "label");

-- CreateIndex
CREATE INDEX "CatalogVersion_orgId_createdAt_idx" ON "CatalogVersion"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PublishAttempt_orgId_createdAt_idx" ON "PublishAttempt"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Learner_orgId_code_key" ON "Learner"("orgId", "code");

-- CreateIndex
CREATE INDEX "Learner_orgId_userId_idx" ON "Learner"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Waiver_learnerId_course_key" ON "Waiver"("learnerId", "course");

-- CreateIndex
CREATE INDEX "Waiver_orgId_idx" ON "Waiver"("orgId");

-- CreateIndex
CREATE INDEX "CompletionEvent_orgId_learnerId_course_idx" ON "CompletionEvent"("orgId", "learnerId", "course");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_orgId_code_key" ON "Cohort"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_cohortId_code_key" ON "ContentItem"("cohortId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_cohortId_learnerId_key" ON "Enrollment"("cohortId", "learnerId");

-- CreateIndex
CREATE INDEX "Enrollment_orgId_learnerId_idx" ON "Enrollment"("orgId", "learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCompletion_cohortId_learnerId_itemCode_key" ON "ItemCompletion"("cohortId", "learnerId", "itemCode");

-- CreateIndex
CREATE INDEX "ItemCompletion_orgId_learnerId_idx" ON "ItemCompletion"("orgId", "learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeScheme_orgId_code_key" ON "GradeScheme"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_cohortId_code_key" ON "Assignment"("cohortId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_supersedesId_key" ON "Submission"("supersedesId");

-- CreateIndex
CREATE INDEX "Submission_cohortId_learnerId_idx" ON "Submission"("cohortId", "learnerId");

-- AddForeignKey
ALTER TABLE "CatalogVersion" ADD CONSTRAINT "CatalogVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVersion" ADD CONSTRAINT "CatalogVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_fromVersionId_fkey" FOREIGN KEY ("fromVersionId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learner" ADD CONSTRAINT "Learner_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learner" ADD CONSTRAINT "Learner_enrolledVersionId_fkey" FOREIGN KEY ("enrolledVersionId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learner" ADD CONSTRAINT "Learner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waiver" ADD CONSTRAINT "Waiver_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waiver" ADD CONSTRAINT "Waiver_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "GradeScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_catalogVersionId_fkey" FOREIGN KEY ("catalogVersionId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompletion" ADD CONSTRAINT "ItemCompletion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompletion" ADD CONSTRAINT "ItemCompletion_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCompletion" ADD CONSTRAINT "ItemCompletion_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeScheme" ADD CONSTRAINT "GradeScheme_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Task 2.2: append-only tables (CLAUDE.md non-negotiable 7, PRD P0-6). Shape follows the template's
-- audit_append_only migration and Bookable's AppointmentEvent trigger (read 2026-10-26): one function,
-- one BEFORE UPDATE OR DELETE row trigger per table. TRUNCATE is left alone (row triggers do not fire
-- on it) so the test harness can empty the tables. A corrected score is a NEW Submission row with
-- supersedesId; a refused item completion is an AuditEvent and no row.
CREATE FUNCTION coursework_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Default ERRCODE (P0001) on purpose: Prisma maps 23xxx codes to its own "constraint violated" text and
  -- drops the message, and the tests (and a Phase 3 screen) read the table name out of this message.
  RAISE EXCEPTION '% is append-only (attempted % on id=%)', TG_TABLE_NAME, TG_OP, OLD."id";
END;
$$;

CREATE TRIGGER "CatalogVersion_append_only"
  BEFORE UPDATE OR DELETE ON "CatalogVersion"
  FOR EACH ROW EXECUTE FUNCTION coursework_append_only();

CREATE TRIGGER "PublishAttempt_append_only"
  BEFORE UPDATE OR DELETE ON "PublishAttempt"
  FOR EACH ROW EXECUTE FUNCTION coursework_append_only();

CREATE TRIGGER "CompletionEvent_append_only"
  BEFORE UPDATE OR DELETE ON "CompletionEvent"
  FOR EACH ROW EXECUTE FUNCTION coursework_append_only();

CREATE TRIGGER "ItemCompletion_append_only"
  BEFORE UPDATE OR DELETE ON "ItemCompletion"
  FOR EACH ROW EXECUTE FUNCTION coursework_append_only();

CREATE TRIGGER "Submission_append_only"
  BEFORE UPDATE OR DELETE ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION coursework_append_only();
