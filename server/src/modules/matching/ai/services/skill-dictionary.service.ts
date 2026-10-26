import { QUEUE, QueueService } from '@/modules/queue/queue.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { AiService } from '@/modules/ai/services/ai.service';
import {
  SEMANTIC_INDEX,
  type SemanticIndex,
} from '@/modules/semantic/semantic-index';
import { foldTerm } from '@/common/text/vietnamese';
import type { SkillDictionary } from '@/modules/matching/rules/types';
import {
  skillMergeSchema,
  type SkillMerge,
} from '../schemas/skill-merge.schema';
import {
  skillMergePrompt,
  BATCH,
  SHORTLIST,
  SYSTEM,
} from '../prompt/skill-merge.prompt';
import {
  skillImpliesSchema,
  type SkillImplies,
} from '../schemas/skill-implies.schema';
import {
  IMPLIES_BATCH,
  IMPLIES_SYSTEM,
  skillImpliesPrompt,
} from '../prompt/skill-implies.prompt';
import { nearest, type Canonical } from '../utils/nearest';
import { picksFor } from '../utils/merge-picks';
import { messageOf } from '@/common/error-message';

const CACHE_MS = 60_000;

export type IngestResult = { added: number; remaining: number };

type Candidate = {
  index: number;
  raw: string;
  key: string;
  vector: number[];
  near: Canonical[];
};

type Decision = { ok: boolean; picks: Map<number, number> };

const vectorLiteral = (vector: number[]) => `[${vector.join(',')}]`;

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
    private readonly queue: QueueService,
  ) {}

  async rebuild() {
    const id = await this.queue.send(QUEUE.SKILL_CANONICALIZE, { round: 0 });
    return { queued: true, queueJobId: id };
  }

  /** Bảng tra cách viết → kỹ năng chuẩn và kỹ năng chuẩn → các kỹ năng nó kéo theo, cache ngắn hạn trong bộ nhớ. */
  async lookup(): Promise<SkillDictionary> {
    if (this.cache && Date.now() < this.cacheUntil) return this.cache;

    const [rows, implying] = await Promise.all([
      this.prisma.skillAlias.findMany({ select: { key: true, skillId: true } }),
      this.prisma.canonicalSkill.findMany({
        where: { implies: { isEmpty: false } },
        select: { id: true, implies: true },
      }),
    ]);
    const aliases = new Map(rows.map((row) => [row.key, row.skillId]));
    const implies = new Map<string, Set<string>>();
    for (const skill of implying) {
      const ids = skill.implies
        .map((key) => aliases.get(key))
        .filter((id): id is string => id !== undefined && id !== skill.id);
      if (ids.length) implies.set(skill.id, new Set(ids));
    }
    this.cache = { aliases, implies };
    this.cacheUntil = Date.now() + CACHE_MS;
    return this.cache;
  }

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

  async profileSkills(): Promise<string[]> {
    const profiles = await this.prisma.profile.findMany({
      select: { primarySkills: true, secondarySkills: true },
    });
    return profiles.flatMap((row) => [
      ...row.primarySkills,
      ...row.secondarySkills,
    ]);
  }

  /** Hỏi model các kỹ năng mà mỗi kỹ năng chuẩn của hồ sơ kéo theo; kỹ năng đã hỏi thì bỏ qua, lỗi thì để lần ghi hồ sơ sau hỏi lại. */
  async inferImplications(skills: string[]): Promise<number> {
    const { aliases } = await this.lookup();
    const ids = new Set<string>();
    for (const term of skills) {
      const id = aliases.get(foldTerm(term));
      if (id) ids.add(id);
    }
    if (!ids.size) return 0;

    const pending = await this.prisma.canonicalSkill.findMany({
      where: { id: { in: [...ids] }, impliesCheckedAt: null },
      select: { id: true, name: true },
    });

    let asked = 0;
    const implied: string[] = [];
    for (let start = 0; start < pending.length; start += IMPLIES_BATCH) {
      const chunk = pending.slice(start, start + IMPLIES_BATCH);
      let answer: SkillImplies;
      try {
        const { object } = await this.ai.generateObject<SkillImplies>({
          schema: skillImpliesSchema,
          context: { purpose: 'skill.implies' },
          modelId: this.config.get<string>('matching.dictionaryModelId'),
          system: IMPLIES_SYSTEM,
          prompt: skillImpliesPrompt(chunk.map((skill) => skill.name)),
        });
        answer = object;
      } catch (error) {
        this.logger.warn(
          `Model không liệt kê được kỹ năng kéo theo: ${messageOf(error)}`,
        );
        break;
      }

      const byIndex = new Map(
        answer.skills.map((row) => [row.index, row.implies]),
      );
      for (const [offset, skill] of chunk.entries()) {
        const names = byIndex.get(offset + 1);
        if (!names) continue;
        await this.prisma.canonicalSkill.updateMany({
          where: { id: skill.id, impliesCheckedAt: null },
          data: { implies: names.map(foldTerm), impliesCheckedAt: new Date() },
        });
        implied.push(...names);
        asked += 1;
      }
    }

    if (implied.length) await this.ingest(implied);
    this.cache = null;
    this.logger.log(
      `Kỹ năng kéo theo: đã hỏi ${asked}/${pending.length} kỹ năng`,
    );
    return asked;
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

  private async createCanonical(candidate: Candidate): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `insert into canonical_skills (id, name, model, embedding)
         values (gen_random_uuid()::text, $1, $2, $3::vector)
         returning id`,
        candidate.raw,
        this.semantic.modelId,
        vectorLiteral(candidate.vector),
      );
      await tx.skillAlias.create({
        data: {
          key: candidate.key,
          raw: candidate.raw,
          skillId: rows[0].id,
          source: 'EXACT',
        },
      });
      return rows[0].id;
    });
  }

  /** Phân loại cách viết mới theo lô; chuỗi đã có trong danh bạ thì bỏ qua, không gọi model. */
  async ingest(
    rawTerms: string[],
    maxNew = Number.POSITIVE_INFINITY,
  ): Promise<IngestResult> {
    const { aliases: known } = await this.lookup();
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
      if (!picks) {
        this.logger.warn(
          `Model bỏ sót dòng: hỏi ${askable.length} chuỗi, nhận ${object.decisions.length} lựa chọn hợp lệ`,
        );
        return { ok: false, picks: new Map() };
      }
      return { ok: true, picks };
    } catch (error) {
      const message = messageOf(error);
      this.logger.warn(`Model không phân loại được lô này: ${message}`);
      return { ok: false, picks: new Map() };
    }
  }

  private async persist(
    candidates: Candidate[],
    decision: Decision,
    canonicals: Canonical[],
  ): Promise<number> {
    if (!decision.ok) return 0;

    let added = 0;

    for (const candidate of candidates) {
      const picked = decision.picks.get(candidate.index) ?? 0;
      const target =
        picked >= 1 && picked <= candidate.near.length
          ? candidate.near[picked - 1]
          : null;

      try {
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

        const id = await this.createCanonical(candidate);
        canonicals.push({
          id,
          name: candidate.raw,
          aliases: [candidate.raw],
          vector: candidate.vector,
        });
        added += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        this.logger.log(
          `Danh bạ: "${candidate.raw}" đã được lượt khác thêm trước, bỏ qua`,
        );
      }
    }

    return added;
  }
}
