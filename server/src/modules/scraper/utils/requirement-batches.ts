export const REQUIREMENTS_BATCH = 5;

export function requirementBatches(
  jobIds: string[],
): Array<{ jobIds: string[] }> {
  const batches: Array<{ jobIds: string[] }> = [];
  for (let start = 0; start < jobIds.length; start += REQUIREMENTS_BATCH) {
    batches.push({ jobIds: jobIds.slice(start, start + REQUIREMENTS_BATCH) });
  }
  return batches;
}
