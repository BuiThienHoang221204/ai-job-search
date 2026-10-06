export type Embedding = number[];

export const EMBEDDING_DIM = 768;

export interface SemanticIndex {
  readonly modelId: string;

  embed(texts: string[]): Promise<Embedding[]>;
}

export const SEMANTIC_INDEX = Symbol('SemanticIndex');

export function truncateAndNormalise(raw: Embedding): Embedding {
  const cut = raw.slice(0, EMBEDDING_DIM);
  if (cut.length < EMBEDDING_DIM) {
    throw new Error(
      `Vector chỉ có ${cut.length} chiều, cần ít nhất ${EMBEDDING_DIM}.`,
    );
  }

  const norm = Math.sqrt(cut.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return cut;
  return cut.map((value) => value / norm);
}
