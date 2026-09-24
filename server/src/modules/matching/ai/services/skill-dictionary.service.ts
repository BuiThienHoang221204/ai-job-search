import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { AiService } from '../../../ai/services/ai.service.js';
import {
  SEMANTIC_INDEX,
  type SemanticIndex,
} from '../../../semantic/semantic-index.js';
import { foldTerm } from '../../../../common/text/vietnamese.js';
import type { SkillDictionary } from '../../rules/types.js';
import {
  skillMergeSchema,
  type SkillMerge,
} from '../schemas/skill-merge.schema.js';
import {
  skillMergePrompt,
  BATCH,
  SHORTLIST,
  SYSTEM,
} from '../prompt/skill-merge.prompt.js';
import { nearest, type Canonical } from '../utils/nearest.js';
import { picksFor } from '../utils/merge-picks.js';

/** Hạn dùng của bảng tra trong bộ nhớ. */
const CACHE_MS = 60_000;

/** `remaining` là số cách viết chưa biết mà lượt này CỐ Ý chưa đụng tới. */
export type IngestResult = { added: number; remaining: number };

type Candidate = {
  index: number;
  raw: string;
  key: string;
  vector: number[];
  near: Canonical[];
};

/** `ok: false` = model không trả lời được, lô này phải để nguyên cho lượt sau. */
type Decision = { ok: boolean; picks: Map<number, number> };

const vectorLiteral = (vector: number[]) => `[${vector.join(',')}]`;

/** Như `PROVINCES.aliases` nhưng máy tự điền: embedding thu hẹp ứng viên, model quyết, kết quả ghi DB và dùng lại mãi. */
@Injectable()
export class SkillDictionaryService {
  private readonly logger = new Logger(SkillDictionaryService.name);
  private cache: SkillDictionary | null = null;
  private cacheUntil = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
    @Inject(SEMANTIC_INDEX) private readonly semantic: SemanticIndex,
  ) {}

  /** Cache ngắn hạn trong bộ nhớ: mỗi lần mở danh sách việc làm đều cần, mà bảng chỉ đổi khi hàng đợi nền xong một lô. */
  async lookup(): Promise<SkillDictionary> {
    if (this.cache && Date.now() < this.cacheUntil) return this.cache;

    const rows = await this.prisma.skillAlias.findMany({
      select: { key: true, skillId: true },
    });
    this.cache = new Map(rows.map((row) => [row.key, row.skillId]));
    this.cacheUntil = Date.now() + CACHE_MS;
    return this.cache;
  }

  /** Mọi cách viết kỹ năng đang tồn tại trong database, cả tin lẫn hồ sơ. */
  async allTerms(): Promise<string[]> {
    const [requirements, profiles] = await Promise.all([
      this.prisma.jobRequirement.findMany({
        where: { status: 'DONE' },
        select: { requiredSkills: true, niceToHaveSkills: true },
      }),
      this.prisma.profile.findMany({
        select: {
          headline: true,
          primarySkills: true,
          secondarySkills: true,
        },
      }),
    ]);

    const terms: string[] = [];
    for (const row of requirements) {
      terms.push(...row.requiredSkills, ...row.niceToHaveSkills);
    }
    for (const row of profiles) {
      if (row.headline) terms.push(row.headline);
      terms.push(...row.primarySkills, ...row.secondarySkills);
    }
    return terms;
  }

  private async loadCanonicals(): Promise<Canonical[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      { id: string; name: string; embedding: string; aliases: string[] }[]
    >(
      `select c.id, c.name, c.embedding::text as embedding,
              coalesce(array_agg(a.raw) filter (where a.raw is not null), '{}') as aliases
       from canonical_skills c
       left join skill_aliases a on a."skillId" = c.id
       where c.model = $1
       group by c.id, c.name, c.embedding`,
      this.semantic.modelId,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      vector: JSON.parse(row.embedding) as number[],
    }));
  }

  private async insertCanonical(
    name: string,
    vector: number[],
  ): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `insert into canonical_skills (id, name, model, embedding)
       values (gen_random_uuid()::text, $1, $2, $3::vector)
       returning id`,
      name,
      this.semantic.modelId,
      vectorLiteral(vector),
    );
    return rows[0].id;
  }

  /** Chuỗi đã có trong danh bạ thì bỏ qua hoàn toàn (không embed, không hỏi model) — đó là thứ làm chi phí giảm dần. */
  async ingest(
    rawTerms: string[],
    maxNew = Number.POSITIVE_INFINITY,
  ): Promise<IngestResult> {
    const known = await this.lookup();
    const pending = new Map<string, string>();
    for (const raw of rawTerms) {
      const key = foldTerm(raw);
      if (key.length < 2 || known.has(key) || pending.has(key)) continue;
      pending.set(key, raw);
    }
    if (!pending.size) return { added: 0, remaining: 0 };

    const all = [...pending.entries()];
    const entries = Number.isFinite(maxNew) ? all.slice(0, maxNew) : all;
    const remaining = all.length - entries.length;

    this.logger.log(
      `Danh bạ: ${entries.length} cách viết chưa biết, còn lại ${remaining}`,
    );
    const vectors = await this.semantic.embed(entries.map(([, raw]) => raw));
    const canonicals = await this.loadCanonicals();

    let added = 0;
    for (let start = 0; start < entries.length; start += BATCH) {
      const chunk = entries.slice(start, start + BATCH);
      const candidates: Candidate[] = chunk.map(([key, raw], offset) => ({
        index: offset + 1,
        raw,
        key,
        vector: vectors[start + offset],
        near: nearest(vectors[start + offset], canonicals, SHORTLIST),
      }));

      const decision = await this.decide(candidates);
      added += await this.persist(candidates, decision, canonicals);
    }

    this.cache = null;
    this.logger.log(`Danh bạ: thêm ${added} cách viết`);
    return { added, remaining };
  }

  /** Hỏi model một lượt cho cả lô; chuỗi chưa có ứng viên nào thì không hỏi — nó chắc chắn là kỹ năng chuẩn mới. */
  private async decide(candidates: Candidate[]): Promise<Decision> {
    const askable = candidates.filter((row) => row.near.length > 0);
    if (!askable.length) return { ok: true, picks: new Map() };

    try {
      const { object } = await this.ai.generateObject<SkillMerge>({
        schema: skillMergeSchema,
        context: { purpose: 'skill.canonicalize' },
        modelId: this.config.get<string>('matching.dictionaryModelId'),
        system: SYSTEM,
        prompt: skillMergePrompt(askable),
      });
      const picks = picksFor(
        object.decisions,
        askable.map((row) => row.index),
      );
      // Trả lời thiếu dòng là hỏng NGẦM: dòng vắng mặt thành kỹ năng chuẩn mới, ghi nhãn EXACT y như khi code tự quyết.
      if (!picks) {
        this.logger.warn(
          `Model bỏ sót dòng: hỏi ${askable.length} chuỗi, nhận ${object.decisions.length} lựa chọn hợp lệ`,
        );
        return { ok: false, picks: new Map() };
      }
      return { ok: true, picks };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Model không phân loại được lô này: ${message}`);
      return { ok: false, picks: new Map() };
    }
  }

  private async persist(
    candidates: Candidate[],
    decision: Decision,
    canonicals: Canonical[],
  ): Promise<number> {
    // Lô hỏng thì KHÔNG ghi gì. Ghi đại thành kỹ năng mới là quyết định vĩnh
    // viễn dựa trên một lượt gọi model hết hạn mức, và không nhánh nào xét lại.
    if (!decision.ok) return 0;

    let added = 0;

    for (const candidate of candidates) {
      const picked = decision.picks.get(candidate.index) ?? 0;
      const target =
        picked >= 1 && picked <= candidate.near.length
          ? candidate.near[picked - 1]
          : null;

      if (target) {
        await this.prisma.skillAlias.create({
          data: {
            key: candidate.key,
            raw: candidate.raw,
            skillId: target.id,
            source: 'LLM',
          },
        });
        target.aliases.push(candidate.raw);
        added += 1;
        continue;
      }

      const id = await this.insertCanonical(candidate.raw, candidate.vector);
      await this.prisma.skillAlias.create({
        data: {
          key: candidate.key,
          raw: candidate.raw,
          skillId: id,
          source: 'EXACT',
        },
      });
      canonicals.push({
        id,
        name: candidate.raw,
        aliases: [candidate.raw],
        vector: candidate.vector,
      });
      added += 1;
    }

    return added;
  }
}
