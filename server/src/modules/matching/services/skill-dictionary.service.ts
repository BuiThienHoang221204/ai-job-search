import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import {
  SEMANTIC_INDEX,
  type SemanticIndex,
} from '../../semantic/semantic-index.js';
import { foldTerm } from '../skill-term.js';
import type { SkillDictionary } from '../requirement-match.js';
import {
  skillMergeSchema,
  type SkillMerge,
} from '../schemas/skill-merge.schema.js';

/** Số ứng viên đưa cho model chọn. Rộng hơn không giúp, chỉ làm loãng đề bài. */
const SHORTLIST = 5;

/**
 * Sàn tương đồng của một ứng viên. KHÔNG phải ngưỡng quyết định — model vẫn là
 * bên chốt — mà là mức dưới đó thì ứng viên không đáng đưa ra hỏi.
 *
 * Thiếu nó, lúc danh bạ còn ít mục thì "5 cái gần nhất" là 5 cái bất kỳ, và
 * model bị ép chọn trong một danh sách toàn thứ không liên quan. Đã xảy ra
 * thật: `manual testing` bị gộp với `English`, `Node.js` gộp với `Angular`.
 *
 * Lấy 0,72 vì đo trên 17 cặp mẫu, cặp cùng nghĩa thấp nhất là 0,739.
 */
const MIN_SIMILARITY = 0.72;

/**
 * Trần số cách viết của MỘT kỹ năng. Chạm trần thì không nhận thêm.
 *
 * Một kỹ năng thật có vài cách viết, không có mười bốn. Nhóm phình to là dấu
 * hiệu của gộp dây chuyền — `JavaScript` kéo `TypeScript`, rồi `Node.js`, rồi
 * `Sequelize` — và trần này chặn thiệt hại lại thay vì để nó nuốt cả kho.
 */
const MAX_ALIASES = 6;

/** Số chuỗi hỏi trong MỘT lượt gọi model. Hạn mức tính theo lượt, không theo token. */
const BATCH = 20;

/** Hạn dùng của bảng tra trong bộ nhớ. */
const CACHE_MS = 60_000;

/** `remaining` là số cách viết chưa biết mà lượt này CỐ Ý chưa đụng tới. */
export type IngestResult = { added: number; remaining: number };

const SYSTEM = [
  'Bạn phân loại KỸ NĂNG NGHỀ NGHIỆP. Với mỗi chuỗi, chọn ứng viên chỉ CÙNG MỘT kỹ năng với nó.',
  '',
  'Quy tắc bắt buộc:',
  '- CÙNG MỘT kỹ năng nghĩa là người tuyển dụng viết cách này hay cách kia đều nhận cùng một ứng viên: viết tắt, dịch sang ngôn ngữ khác, hoặc cách gọi khác của đúng nghề đó.',
  '- GẦN NGHĨA thì KHÔNG phải cùng một kỹ năng. Đây là chỗ dễ sai nhất, và sai ở đây ghép ứng viên với công việc họ không làm được:',
  '  · Java và JavaScript là hai ngôn ngữ khác nhau -> 0',
  '  · Kế toán và Kiểm toán là hai nghề khác nhau -> 0',
  '  · Điều dưỡng và Bác sĩ là hai nghề khác nhau -> 0',
  '  · React và Vue là hai thư viện khác nhau -> 0',
  '- Ngược lại, những cặp sau ĐÚNG là một: Y tá và Điều dưỡng, K8s và Kubernetes, CSKH và Chăm sóc khách hàng, Nurse và Điều dưỡng.',
  '- PHẦN LỚN trường hợp đáp án đúng là 0. Ứng viên được đề cử vì gần nghĩa, chứ không phải vì đã đúng.',
  '- Ứng viên nào ghi "mã này đã gồm: ..." thì chuỗi của bạn phải cùng một kỹ năng với TẤT CẢ những cái đó, không riêng cái đứng đầu.',
  '- Không chắc thì trả 0. Tách nhầm chỉ làm danh bạ dài thêm; gộp nhầm làm hỏng kết quả của mọi người dùng.',
  '- Mỗi chuỗi trong đề bài phải có đúng một dòng trả lời.',
].join('\n');

/** Một kỹ năng chuẩn đã nạp sẵn vector, giữ trong bộ nhớ suốt một lượt dựng. */
type Canonical = {
  id: string;
  name: string;
  /** Cách viết ĐÃ nhập vào mã này. Model phải thấy để không gộp dây chuyền. */
  aliases: string[];
  vector: number[];
};

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

/**
 * Danh bạ kỹ năng: mọi cách viết của cùng một kỹ năng trỏ về một mã.
 *
 * Cùng ý tưởng với `PROVINCES.aliases`, nhưng danh sách không liệt kê tay được
 * nên máy tự điền: embedding thu hẹp ứng viên, model quyết định, kết quả ghi
 * xuống database và dùng lại mãi.
 */
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

  /**
   * Bảng tra của đường ĐỌC: dạng đã bỏ dấu -> mã kỹ năng chuẩn.
   *
   * Giữ trong bộ nhớ với hạn dùng ngắn: mỗi lần mở danh sách việc làm đều cần
   * nó, mà bảng chỉ đổi khi hàng đợi nền chạy xong một lô.
   */
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

  /**
   * Dựng danh bạ cho một mớ cách viết kỹ năng.
   *
   * Chuỗi đã có trong danh bạ thì bỏ qua hoàn toàn — không embed, không hỏi
   * model. Đó là thứ giữ chi phí giảm dần theo thời gian.
   */
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
        near: this.nearest(vectors[start + offset], canonicals),
      }));

      const decision = await this.decide(candidates);
      added += await this.persist(candidates, decision, canonicals);
    }

    this.cache = null;
    this.logger.log(`Danh bạ: thêm ${added} cách viết`);
    return { added, remaining };
  }

  /** Cosine trên vector đã chuẩn hoá chính là tích vô hướng. */
  private nearest(vector: number[], canonicals: Canonical[]): Canonical[] {
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
      .slice(0, SHORTLIST)
      .map((row) => row.canonical);
  }

  /**
   * Hỏi model một lượt cho cả lô. Chuỗi chưa có ứng viên nào thì không hỏi —
   * nó chắc chắn là một kỹ năng chuẩn mới.
   */
  private async decide(candidates: Candidate[]): Promise<Decision> {
    const askable = candidates.filter((row) => row.near.length > 0);
    if (!askable.length) return { ok: true, picks: new Map() };

    const prompt = askable
      .map((row) =>
        [
          `[${row.index}] ${row.raw}`,
          ...row.near.map((near, at) => {
            const others = near.aliases.filter((alias) => alias !== near.name);
            const seen = others.length
              ? ` (mã này đã gồm: ${others.join(', ')})`
              : '';
            return `    ${at + 1}. ${near.name}${seen}`;
          }),
        ].join('\n'),
      )
      .join('\n\n');

    try {
      const { object } = await this.ai.generateObject<SkillMerge>({
        schema: skillMergeSchema,
        context: { purpose: 'skill.canonicalize' },
        modelId: this.config.get<string>('matching.dictionaryModelId'),
        system: SYSTEM,
        prompt: `Phân loại từng chuỗi dưới đây:\n\n${prompt}`,
      });
      return {
        ok: true,
        picks: new Map(
          object.decisions.map((row) => [row.term, row.match] as const),
        ),
      };
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
