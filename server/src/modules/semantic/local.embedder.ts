import { Injectable, Logger } from '@nestjs/common';
import {
  truncateAndNormalise,
  type Embedding,
  type SemanticIndex,
} from './semantic-index';

const MODEL_ID = 'Xenova/multilingual-e5-base';
const DTYPE = 'q8';

const BATCH = 64;

const PREFIX = 'query: ';

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

@Injectable()
export class LocalEmbedder implements SemanticIndex {
  private readonly logger = new Logger(LocalEmbedder.name);
  readonly modelId = `${MODEL_ID}:${DTYPE}`;

  private extractor: Promise<Extractor> | null = null;

  private load(): Promise<Extractor> {
    this.extractor ??= (async () => {
      const startedAt = Date.now();
      const { pipeline } = await import('@huggingface/transformers');
      const extractor = (await pipeline('feature-extraction', MODEL_ID, {
        dtype: DTYPE,
      })) as unknown as Extractor;
      this.logger.log(
        `Nạp ${this.modelId} trong ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
      return extractor;
    })();
    return this.extractor;
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    if (!texts.length) return [];

    const extractor = await this.load();
    const startedAt = Date.now();
    const vectors: Embedding[] = [];

    for (let i = 0; i < texts.length; i += BATCH) {
      const output = await extractor(
        texts.slice(i, i + BATCH).map((text) => `${PREFIX}${text}`),
        { pooling: 'mean', normalize: true },
      );
      vectors.push(...output.tolist());
    }

    this.logger.log(
      `embed ${texts.length} đoạn văn bản trong ${Date.now() - startedAt}ms`,
    );
    return vectors.map(truncateAndNormalise);
  }
}
