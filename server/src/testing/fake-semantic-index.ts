import {
  EMBEDDING_DIM,
  truncateAndNormalise,
  type Embedding,
  type SemanticIndex,
} from '../modules/semantic/semantic-index';

export const FAKE_EMBEDDING_MODEL = 'fake-embedder';

export class FakeSemanticIndex implements SemanticIndex {
  readonly modelId = FAKE_EMBEDDING_MODEL;

  readonly calls: string[][] = [];

  async embed(texts: string[]): Promise<Embedding[]> {
    await Promise.resolve();
    this.calls.push([...texts]);
    return texts.map((text) => this.vectorFor(text));
  }

  private vectorFor(text: string): Embedding {
    const raw = new Array<number>(EMBEDDING_DIM);
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 2147483647;
    }
    let state = seed || 1;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      state = (state * 48271) % 2147483647;
      raw[i] = state / 2147483647 - 0.5;
    }
    return truncateAndNormalise(raw);
  }
}
