/**
 * Tính tỉ lệ khớp yêu cầu cho MỌI cặp (hồ sơ, tin) đã có sẵn trong database.
 *
 * Chạy một lần sau khi thêm bảng `job_requirement_matches`. Từ đó trở đi hàng
 * đợi `match.requirements` tự lo: rút xong yêu cầu một tin thì đối chiếu tin
 * đó, sửa hồ sơ thì đối chiếu lại hồ sơ đó.
 *
 * Cờ:
 *   --dry-run   chỉ đếm, không ghi gì
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { matchRequirements } from '../dist/modules/matching/requirement-match.js';
import { JobRequirementsService } from '../dist/modules/matching/services/job-requirements.service.js';
import { MIN_COMPLETION_TO_SCORE } from '../dist/modules/scraper/fan-out.js';

const DRY_RUN = process.argv.includes('--dry-run');
const MIN_MET_TO_STORE = 1;
const CHUNK = 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const [requirements, profiles] = await Promise.all([
    prisma.jobRequirement.findMany({ where: { status: 'DONE' } }),
    prisma.profile.findMany({
      where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: {
        userId: true,
        headline: true,
        primarySkills: true,
        secondarySkills: true,
        citizenship: true,
        workPermit: true,
        location: true,
        willingToRelocate: true,
        experiences: true,
        updatedAt: true,
      },
    }),
  ]);

  console.log(
    `${requirements.length} tin đã rút yêu cầu × ${profiles.length} hồ sơ đủ điều kiện`,
  );

  const rows = [];
  const perUser = new Map();

  for (const profile of profiles) {
    const matchProfile = JobRequirementsService.toMatchProfile(profile);
    const stamp = profile.updatedAt.toISOString();

    for (const requirement of requirements) {
      const result = matchRequirements(
        JobRequirementsService.toRequirements(requirement),
        matchProfile,
      );
      if (result.met < MIN_MET_TO_STORE) continue;

      rows.push({
        userId: profile.userId,
        jobId: requirement.jobId,
        met: result.met,
        total: result.total,
        percent: result.score,
        eligibility: result.eligibility,
        locationPass:
          result.checks.find((check) => check.kind === 'LOCATION')?.met ?? null,
        hash: `${requirement.sourceHash ?? requirement.jobId}:${stamp}`,
      });

      const seen = perUser.get(profile.userId) ?? { rows: 0, over: 0 };
      seen.rows += 1;
      if (result.score >= 50) seen.over += 1;
      perUser.set(profile.userId, seen);
    }
  }

  console.log(`\nCặp có ít nhất 1 yêu cầu khớp: ${rows.length}`);
  for (const [userId, seen] of perUser) {
    console.log(`  ${userId.padEnd(30)} ${seen.rows} cặp, ${seen.over} tin >= 50%`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: không ghi gì.');
    return;
  }

  await prisma.jobRequirementMatch.deleteMany({});
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.jobRequirementMatch.createMany({ data: rows.slice(i, i + CHUNK) });
  }
  console.log(`\nĐã ghi ${rows.length} hàng.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
