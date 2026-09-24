/** Luật `stale` dùng CHUNG với `jobs`, đừng chép lại: hai bên lệch nhau thì danh sách và trang chi tiết nói khác nhau. */
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
