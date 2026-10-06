export const MIN_SIMILARITY = 0.72;

export const MAX_ALIASES = 6;

export type Canonical = {
  id: string;
  name: string;
  aliases: string[];
  vector: number[];
};

export function nearest(
  vector: number[],
  canonicals: Canonical[],
  shortlist: number,
): Canonical[] {
  return canonicals
    .map((canonical) => {
      let score = 0;
      for (let i = 0; i < vector.length; i += 1) {
        score += vector[i] * canonical.vector[i];
      }
      return { canonical, score };
    })
    .filter(
      (row) =>
        row.score >= MIN_SIMILARITY &&
        row.canonical.aliases.length < MAX_ALIASES,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, shortlist)
    .map((row) => row.canonical);
}
