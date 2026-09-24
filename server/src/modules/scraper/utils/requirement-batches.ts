/** Gộp năm tin một lượt: `job.requirements` từng chiếm 48% lượt gọi model của cả hệ thống (633/1.311, đo trên `ai_calls`). */
export const REQUIREMENTS_BATCH = 5;

/** Chia danh sách id thành payload của hàng đợi. Khoá dedup là VÂN TAY của cả lô, tính trong `queue-key.ts`. */
export function requirementBatches(
  jobIds: string[],
  size = REQUIREMENTS_BATCH,
): Array<{ jobIds: string[] }> {
  const batches: Array<{ jobIds: string[] }> = [];
  for (let start = 0; start < jobIds.length; start += size) {
    batches.push({ jobIds: jobIds.slice(start, start + size) });
  }
  return batches;
}
