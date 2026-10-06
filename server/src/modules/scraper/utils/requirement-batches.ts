export const REQUIREMENTS_BATCH = 5;

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
