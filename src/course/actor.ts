/** Who is writing. The foundation audit log's actor shape (orgId + user, user null for a system write). */
export type Actor = { orgId: string; userId: string | null };
