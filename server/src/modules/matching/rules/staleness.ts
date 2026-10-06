export function isStaleMatch(
  evaluatedAt: Date | null,
  profileUpdatedAt: Date | null,
): boolean {
  return (
    profileUpdatedAt !== null &&
    evaluatedAt !== null &&
    evaluatedAt < profileUpdatedAt
  );
}
