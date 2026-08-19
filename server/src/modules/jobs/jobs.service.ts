import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  FitVerdict,
  MatchStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JobRequirement } from '../../generated/prisma/client.js';
import { JobRequirementsService } from '../matching/services/job-requirements.service.js';
import {
  matchRequirements,
  type MatchProfile,
} from '../matching/requirement-match.js';
import { keywordOverlap } from '../scraper/fan-out.js';
import { derivedFields } from './taxonomy/derived.js';
import { OCCUPATIONS } from './taxonomy/occupations.js';
import { PROVINCES, REMOTE_CODE } from './taxonomy/provinces.js';
import { normalizeText } from './taxonomy/resolve.js';
import type { CreateJobDto, JobSort, ListJobsQueryDto } from './job.dto.js';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo hoặc cập nhật tin tuyển dụng. */
  async upsert(dto: CreateJobDto) {
    const data = {
      title: dto.title,
      company: dto.company,
      description: dto.description,
      url: dto.url ?? '',
      source: dto.source ?? 'manual',
      externalId: dto.externalId ?? null,
      companyLogo: dto.companyLogo ?? null,
      location: dto.location ?? null,
      workMode: dto.workMode ?? null,
      salaryRaw: dto.salaryRaw ?? null,
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      currency: dto.currency ?? null,
      tags: dto.tags ?? [],
      ...derivedFields(dto.title, dto.company, dto.location, dto.tags ?? []),
    };

    if (!data.externalId) return this.prisma.job.create({ data });

    return this.prisma.job.upsert({
      where: {
        source_externalId: { source: data.source, externalId: data.externalId },
      },
      create: data,
      update: data,
    });
  }

  /**
   * Quan hệ `saves` đã được lọc sẵn theo userId, nên chỉ cần biết mảng có
   * rỗng hay không. Tách ra thành hàm riêng để logic này chỉ tồn tại ở một
   * chỗ.
   */
  private withSavedFlag<T extends { saves: unknown[] }>(job: T) {
    const { saves, ...rest } = job;
    return { ...rest, saved: saves.length > 0 };
  }

  /**
   * Gắn trạng thái chấm điểm của CHÍNH người dùng đang hỏi vào mỗi tin.
   *
   * Thiếu trường này thì giao diện không có cách nào biết một tin đã có điểm,
   * nên nó luôn mời bấm "Chấm điểm" kể cả khi điểm đã nằm sẵn trong database.
   */
  private withMatchState<
    T extends {
      matches: {
        status: MatchStatus;
        overallScore: number | null;
        verdict: FitVerdict | null;
      }[];
    },
  >(job: T) {
    const { matches, ...rest } = job;
    return { ...rest, match: matches[0] ?? null };
  }

  /** `matches` được lọc theo userId nên nhiều nhất một phần tử. */
  private readonly relations = (userId: string) => ({
    saves: { where: { userId }, select: { id: true } },
    matches: {
      where: { userId },
      select: { status: true, overallScore: true, verdict: true },
    },
    requirements: true,
  });

  /** Hồ sơ rút về đúng những trường việc đối chiếu cần. */
  private async matchProfileOf(userId: string): Promise<MatchProfile | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        headline: true,
        primarySkills: true,
        secondarySkills: true,
        citizenship: true,
        workPermit: true,
        location: true,
        willingToRelocate: true,
      },
    });
    return profile ? JobRequirementsService.toMatchProfile(profile) : null;
  }

  /**
   * Đối chiếu hồ sơ với yêu cầu của tin, hoặc lùi về đếm từ khoá khi tin chưa
   * được rút trích.
   *
   * KHÔNG đổi ra phần trăm. Tin liệt kê mọi thứ họ muốn còn hồ sơ chỉ khai vài
   * thứ, nên tỉ lệ luôn bị dìm - đã đo: 2/10 trên một tin AI chấm 80.
   */
  private withSystemMatch<
    T extends {
      title: string;
      tags: string[];
      requirements: JobRequirement | null;
    },
  >(job: T, profile: MatchProfile | null) {
    const { requirements, ...rest } = job;

    if (!profile) {
      return { ...rest, systemMatch: null };
    }

    if (requirements?.status === 'DONE') {
      const result = matchRequirements(
        JobRequirementsService.toRequirements(requirements),
        profile,
      );
      return {
        ...rest,
        systemMatch: {
          kind: 'REQUIREMENTS' as const,
          met: result.met,
          total: result.total,
          score: result.score,
          eligibility: result.eligibility,
          checks: result.checks,
        },
      };
    }

    return {
      ...rest,
      systemMatch: {
        kind: 'KEYWORDS' as const,
        met: keywordOverlap(
          `${job.title} ${job.tags.join(' ')}`,
          profile.skills,
        ),
        total: profile.skills.length,
        score: 0,
        eligibility: 'UNVERIFIED' as const,
        checks: [],
      },
    };
  }

  /**
   * Điều kiện lọc, dựng thành MỘT `where` để Postgres lọc, đếm và cắt trang
   * trong cùng một truy vấn. Trước đây bộ lọc chạy trong bộ nhớ trên 300 tin
   * mới nhất, nên tin thứ 301 trở đi không tồn tại với người đi tìm.
   */
  private whereFrom(
    query: ListJobsQueryDto,
    userId: string,
  ): Prisma.JobWhereInput {
    const needle = query.q ? normalizeText(query.q) : '';
    const since = query.postedWithin
      ? new Date(Date.now() - query.postedWithin * 24 * 60 * 60 * 1000)
      : null;

    return {
      // Bản sao của tin đã có ở portal khác không bao giờ vào danh sách: nó
      // không mang thông tin mới, chỉ đẩy tin khác xuống dưới.
      duplicateOfId: null,
      ...(needle ? { searchText: { contains: needle } } : {}),
      ...(query.province?.length
        ? { provinceCode: { in: query.province } }
        : {}),
      ...(query.occupation?.length
        ? { occupationCode: { in: query.occupation } }
        : {}),
      ...(query.workMode?.length ? { workMode: { in: query.workMode } } : {}),
      // So với `salaryMax`: câu hỏi là "tin này trả tới mức tôi cần không",
      // không phải "sàn của tin có cao hơn mức tôi cần không".
      ...(query.salaryMin ? { salaryMax: { gte: query.salaryMin } } : {}),
      ...(since ? { postedAt: { gte: since } } : {}),
      ...(query.scored
        ? { matches: { some: { userId, status: 'DONE' as const } } }
        : {}),
    };
  }

  /**
   * Thứ tự luôn kết bằng `id`: hai tin cùng mốc thời gian mà không có khoá phụ
   * thì Postgres được phép trả chúng theo thứ tự khác nhau ở mỗi truy vấn, và
   * khi đó lật trang sẽ vừa lặp vừa bỏ sót bản ghi.
   *
   * "Mới nhất" đo bằng `scrapedAt` chứ không phải `postedAt`, và đó là một
   * đánh đổi có chủ đích: `postedAt` nullable nên phải sắp `DESC NULLS LAST`,
   * mà thứ tự đó không index được - đo trên 50.000 tin thì mỗi lần mở danh
   * sách là một lần quét toàn bảng. `scrapedAt` không null nên index đỡ được.
   */
  private orderFor(sort: JobSort): Prisma.JobOrderByWithRelationInput[] {
    if (sort === 'salary') {
      // Tin không công bố lương xuống cuối, thay vì bị coi là lương 0 rồi trộn
      // lẫn với những tin lương thật sự thấp. Chế độ này CHẤP NHẬN phải sắp
      // lại kết quả: nó ít được chọn hơn hẳn thứ tự mặc định.
      return [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    }
    return [{ scrapedAt: 'desc' }, { id: 'desc' }];
  }

  /**
   * Trường của một thẻ việc làm.
   *
   * CỐ Ý không có `description`: nó có trần 60KB và không thẻ nào hiển thị nó,
   * nên trả về là kéo hàng megabyte qua dây cho mỗi lần lật trang.
   */
  private readonly cardSelect = (userId: string) =>
    ({
      id: true,
      source: true,
      externalId: true,
      url: true,
      title: true,
      company: true,
      companyLogo: true,
      location: true,
      workMode: true,
      salaryRaw: true,
      salaryMin: true,
      salaryMax: true,
      currency: true,
      tags: true,
      postedAt: true,
      scrapedAt: true,
      provinceCode: true,
      occupationCode: true,
      saves: { where: { userId }, select: { id: true } },
      matches: {
        where: { userId },
        select: { status: true, overallScore: true, verdict: true },
      },
      requirements: true,
    }) satisfies Prisma.JobSelect;

  async list(query: ListJobsQueryDto, userId: string) {
    const where = this.whereFrom(query, userId);
    const sort = query.sort ?? 'newest';

    if (sort === 'match') return this.listByMatchScore(where, query, userId);

    const [rows, total, profile] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: this.orderFor(sort),
        ...pageArgs(query),
        select: this.cardSelect(userId),
      }),
      this.prisma.job.count({ where }),
      this.matchProfileOf(userId),
    ]);

    return pageOf(
      rows.map((job) =>
        this.withSystemMatch(
          this.withMatchState(this.withSavedFlag(job)),
          profile,
        ),
      ),
      total,
      query,
    );
  }

  /**
   * Sắp theo điểm AI. Truy vấn đi từ phía `job_matches` chứ không phải `jobs`:
   * điểm nằm ở bảng đó, và index `[userId, overallScore desc]` chỉ dùng được
   * khi nó là bảng dẫn đầu.
   *
   * Hệ quả cố ý: chế độ này CHỈ trả tin đã chấm điểm. Trộn tin chưa chấm vào
   * một danh sách sắp theo điểm thì không có chỗ nào đặt chúng cho đúng.
   */
  private async listByMatchScore(
    jobWhere: Prisma.JobWhereInput,
    query: ListJobsQueryDto,
    userId: string,
  ) {
    const where = {
      userId,
      status: 'DONE' as const,
      job: jobWhere,
    };

    const [rows, total, profile] = await Promise.all([
      this.prisma.jobMatch.findMany({
        where,
        orderBy: [{ overallScore: 'desc' }, { jobId: 'desc' }],
        ...pageArgs(query),
        select: { job: { select: this.cardSelect(userId) } },
      }),
      this.prisma.jobMatch.count({ where }),
      this.matchProfileOf(userId),
    ]);

    return pageOf(
      rows.map((row) =>
        this.withSystemMatch(
          this.withMatchState(this.withSavedFlag(row.job)),
          profile,
        ),
      ),
      total,
      query,
    );
  }

  /**
   * Danh mục cho thanh bộ lọc, kèm số tin mỗi mục.
   *
   * Đếm trên TOÀN BỘ bảng chứ không theo bộ lọc đang chọn: đếm động phải chạy
   * lại một `groupBy` cho mỗi lần người dùng tích một ô, và với quy mô của đề
   * tài thì lợi ích không bù được chi phí đó.
   */
  async filters() {
    const [byProvince, byOccupation] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['provinceCode'],
        orderBy: { provinceCode: 'asc' },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['occupationCode'],
        orderBy: { occupationCode: 'asc' },
        _count: true,
      }),
    ]);

    const provinceCounts = new Map(
      byProvince.map((row) => [row.provinceCode, row._count]),
    );
    const occupationCounts = new Map(
      byOccupation.map((row) => [row.occupationCode, row._count]),
    );

    return {
      provinces: PROVINCES.map((province) => ({
        code: province.code,
        name: province.name,
        count: provinceCounts.get(province.code) ?? 0,
      })),
      occupations: OCCUPATIONS.map((occupation) => ({
        code: occupation.code,
        name: occupation.name,
        count: occupationCounts.get(occupation.code) ?? 0,
      })),
      /// Tin làm từ xa không thuộc tỉnh nào nên không nằm trong `PROVINCES`.
      remote: {
        code: REMOTE_CODE,
        name: 'Làm việc từ xa',
        count: provinceCounts.get(REMOTE_CODE) ?? 0,
      },
    };
  }

  async get(id: string, userId: string) {
    const [job, skills] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id },
        include: this.relations(userId),
      }),
      this.matchProfileOf(userId),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${id}`);
    return this.withSystemMatch(
      this.withMatchState(this.withSavedFlag(job)),
      skills,
    );
  }

  /**
   * Lưu tin. Bấm nút hai lần không được sinh lỗi - dùng upsert thay vì
   * create.
   */
  async save(userId: string, jobId: string) {
    await this.get(jobId, userId);
    await this.prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
    return { saved: true };
  }

  /**
   * Bỏ lưu. Bỏ một tin chưa từng lưu cũng trả về bình thường: nút bấm là một
   * công tắc, không phải một giao dịch.
   */
  async unsave(userId: string, jobId: string) {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: false };
  }

  async listSaved(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [saves, total] = await this.prisma.$transaction([
      this.prisma.savedJob.findMany({
        where,
        orderBy: { savedAt: 'desc' },
        ...pageArgs(query),
        include: { job: true },
      }),
      this.prisma.savedJob.count({ where }),
    ]);

    return pageOf(
      saves.map((save) => ({
        ...save.job,
        saved: true,
        savedAt: save.savedAt,
      })),
      total,
      query,
    );
  }
}
