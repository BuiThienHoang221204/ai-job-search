import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { daysAgo } from '@/common/duration';
import { SkillDictionaryService } from '@/modules/matching/ai/services/skill-dictionary.service';
import { skillKeyOf } from '@/modules/upskill/utils/skill-gaps';
import { OCCUPATIONS, OTHER_CODE } from '@/modules/jobs/taxonomy/occupations';
import { PROVINCES } from '@/modules/jobs/taxonomy/provinces';
import { SUB_OCCUPATIONS } from '@/modules/jobs/taxonomy/sub-occupations';
import { SUB_OCCUPATION_POSITIONS } from '@/modules/salary/utils/sub-occupation-map';
import {
  MARKET_WINDOW_DAYS,
  MIN_MARKET_JOBS,
  marketSections,
  marketSlugOf,
  postedBetween,
} from './market.utils';

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SkillDictionaryService,
  ) {}

  /** Các ngành đủ tin trong 30 ngày để có báo cáo, nhiều tin trước. */
  async occupations() {
    const now = new Date();
    const groups = await this.prisma.job.groupBy({
      by: ['occupationCode'],
      where: {
        duplicateOfId: null,
        ...postedBetween(daysAgo(MARKET_WINDOW_DAYS, now.getTime()), now),
      },
      _count: { _all: true },
    });
    const totals = new Map(
      groups.map((group) => [group.occupationCode, group._count._all]),
    );
    return OCCUPATIONS.filter((occupation) => occupation.code !== OTHER_CODE)
      .map((occupation) => ({
        slug: marketSlugOf(occupation.name),
        name: occupation.name,
        total: totals.get(occupation.code) ?? 0,
      }))
      .filter((occupation) => occupation.total >= MIN_MARKET_JOBS)
      .sort((a, b) => b.total - a.total);
  }

  async report(slug: string) {
    const occupation = OCCUPATIONS.find(
      (item) => item.code !== OTHER_CODE && marketSlugOf(item.name) === slug,
    );
    if (!occupation) {
      throw new NotFoundException('Chưa có báo cáo thị trường cho ngành này.');
    }

    const now = new Date();
    const from = daysAgo(MARKET_WINDOW_DAYS, now.getTime());
    const subs = SUB_OCCUPATIONS[occupation.code] ?? [];
    const [rows, dictionary, salaryPositions] = await Promise.all([
      this.prisma.job.findMany({
        where: {
          duplicateOfId: null,
          occupationCode: occupation.code,
          ...postedBetween(from, now),
        },
        select: {
          subOccupationCode: true,
          provinceCode: true,
          salaryMin: true,
          salaryMax: true,
          companyKey: true,
          requirements: {
            select: { status: true, requiredSkills: true, seniority: true },
          },
        },
      }),
      this.dictionary.lookup(),
      this.prisma.salaryReference.findMany({
        where: {
          visibility: 'PUBLIC',
          positionSlug: {
            in: subs.flatMap((sub) => SUB_OCCUPATION_POSITIONS[sub.code] ?? []),
          },
        },
        select: { positionSlug: true },
      }),
    ]);
    if (rows.length < MIN_MARKET_JOBS) {
      throw new NotFoundException('Chưa có báo cáo thị trường cho ngành này.');
    }

    const jobs = rows.map((row) => ({
      ...row,
      skillKeys:
        row.requirements?.status === 'DONE'
          ? row.requirements.requiredSkills.map((skill) =>
              skillKeyOf(skill, dictionary),
            )
          : null,
      seniority: row.requirements?.seniority ?? null,
    }));
    const skills = await this.prisma.canonicalSkill.findMany({
      where: {
        id: { in: [...new Set(jobs.flatMap((job) => job.skillKeys ?? []))] },
      },
      select: { id: true, name: true },
    });
    const names = new Map([
      ...skills.map((skill): [string, string] => [skill.id, skill.name]),
      ...subs.map((sub): [string, string] => [sub.code, sub.name]),
      ...PROVINCES.map((province): [string, string] => [
        province.code,
        province.name,
      ]),
    ]);

    return {
      slug,
      name: occupation.name,
      from,
      to: now,
      total: rows.length,
      companies: new Set(rows.map((row) => row.companyKey).filter(Boolean))
        .size,
      ...marketSections(
        jobs,
        names,
        new Set(salaryPositions.map((row) => row.positionSlug)),
      ),
    };
  }
}
