-- Coursework decisions pass (2026-10-26). Hand-written; CI's `prisma migrate diff` proves it equals the schema.
--   D-56  OrgArchive: an org with history is archived, never deleted. Insert-only; while a row exists, every
--         clone table that carries orgId refuses INSERT and UPDATE (coursework_refuse_archived), and the two
--         cohort-scoped tables (ContentItem, Assignment) refuse through their cohort.
--   D-52  CatalogDraft: one mutable in-progress edit per editor; publishing it still goes through the engine.
--   D-51  Learner(orgId, userId) unique: one learner per user per org (NULLs distinct).

-- CreateTable
CREATE TABLE "OrgArchive" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedBy" UUID,
    "reason" TEXT NOT NULL,

    CONSTRAINT "OrgArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogDraft" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "editorUserId" UUID NOT NULL,
    "baseVersionId" UUID NOT NULL,
    "ops" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CatalogDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgArchive_orgId_key" ON "OrgArchive"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogDraft_orgId_editorUserId_key" ON "CatalogDraft"("orgId", "editorUserId");

-- DropIndex / CreateIndex: D-51
DROP INDEX "Learner_orgId_userId_idx";
CREATE UNIQUE INDEX "Learner_orgId_userId_key" ON "Learner"("orgId", "userId");

-- AddForeignKey
ALTER TABLE "OrgArchive" ADD CONSTRAINT "OrgArchive_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogDraft" ADD CONSTRAINT "CatalogDraft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogDraft" ADD CONSTRAINT "CatalogDraft_editorUserId_fkey" FOREIGN KEY ("editorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogDraft" ADD CONSTRAINT "CatalogDraft_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "CatalogVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D-56: the archive row itself is insert-only (same function as the five history tables).
CREATE TRIGGER "OrgArchive_append_only"
  BEFORE UPDATE OR DELETE ON "OrgArchive"
  FOR EACH ROW EXECUTE FUNCTION coursework_append_only();

-- D-56: no new writes in an archived org. The application refuses first with a sentence (src/course/archive.ts);
-- this is the backstop for any path that forgets. Default ERRCODE (P0001), as coursework_append_only, so Prisma
-- keeps the message. DELETE is not covered: the history tables refuse it already, and the mutable ones
-- (CatalogDraft) may be cleared.
CREATE FUNCTION coursework_refuse_archived() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "OrgArchive" WHERE "orgId" = NEW."orgId") THEN
    RAISE EXCEPTION 'org % is archived: % on % refused', NEW."orgId", TG_OP, TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION coursework_refuse_archived_by_cohort() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Cohort" c JOIN "OrgArchive" a ON a."orgId" = c."orgId" WHERE c."id" = NEW."cohortId") THEN
    RAISE EXCEPTION 'org of cohort % is archived: % on % refused', NEW."cohortId", TG_OP, TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CatalogVersion_refuse_archived" BEFORE INSERT OR UPDATE ON "CatalogVersion" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "PublishAttempt_refuse_archived" BEFORE INSERT OR UPDATE ON "PublishAttempt" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "Learner_refuse_archived" BEFORE INSERT OR UPDATE ON "Learner" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "Waiver_refuse_archived" BEFORE INSERT OR UPDATE ON "Waiver" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "CompletionEvent_refuse_archived" BEFORE INSERT OR UPDATE ON "CompletionEvent" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "Cohort_refuse_archived" BEFORE INSERT OR UPDATE ON "Cohort" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "Enrollment_refuse_archived" BEFORE INSERT OR UPDATE ON "Enrollment" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "ItemCompletion_refuse_archived" BEFORE INSERT OR UPDATE ON "ItemCompletion" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "GradeScheme_refuse_archived" BEFORE INSERT OR UPDATE ON "GradeScheme" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "Submission_refuse_archived" BEFORE INSERT OR UPDATE ON "Submission" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "CatalogDraft_refuse_archived" BEFORE INSERT OR UPDATE ON "CatalogDraft" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived();
CREATE TRIGGER "ContentItem_refuse_archived" BEFORE INSERT OR UPDATE ON "ContentItem" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived_by_cohort();
CREATE TRIGGER "Assignment_refuse_archived" BEFORE INSERT OR UPDATE ON "Assignment" FOR EACH ROW EXECUTE FUNCTION coursework_refuse_archived_by_cohort();
