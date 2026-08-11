import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { missingFields } from '../profile/completion.js';
import { buildSuggestions, type SuggestionInput } from './suggestions.js';
import { recurringGaps } from './skill-gaps.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/// Đường ĐỌC của màn hình Tổng quan.
///
/// Không một hàm nào trong file này được gọi AI. Điểm phù hợp đã được worker
/// chấm sẵn và lưu vào job_matches; ở đây chỉ tổng hợp lại. Đây là lý do mở
/// dashboard mất vài chục mili-giây thay vì vài phút, và là lý do điểm số
/// không nhảy mỗi lần tải lại trang.
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
  ) {}

  /// Tin bị cổng điều kiện loại KHÔNG được tính vào các con số phù hợp.
  ///
  /// `04-job-evaluation.md` bắt gán overallScore = 0 khi eligibility = FAIL.
  /// Số 0 đó nghĩa là "không được xét", KHÔNG phải "chấm thấp" - trộn nó vào
  /// trung bình thì một ứng viên mạnh xin việc đòi quốc tịch EU sẽ thấy điểm
  /// phù hợp của mình tụt, như thể lỗi ở hồ sơ. Tin bị loại đã được đếm riêng
  /// ở `ineligibleCount` và báo qua thẻ gợi ý.
  private static readonly ELIGIBLE = {
    status: 'DONE',
    NOT: { eligibility: 'FAIL' },
  } as const;

  async overview(userId: string) {
    const since = new Date(Date.now() - SEVEN_DAYS_MS);
    const eligible = { userId, ...DashboardService.ELIGIBLE };

    const [
      profile,
      matchCount,
      newThisWeek,
      aggregate,
      topMatches,
      recentFive,
      ineligibleCount,
      scoredJobs,
      applications,
      totalScored,
    ] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.jobMatch.count({ where: eligible }),
      this.prisma.jobMatch.count({
        where: { ...eligible, createdAt: { gte: since } },
      }),
      this.prisma.jobMatch.aggregate({
        where: eligible,
        _avg: { overallScore: true },
      }),
      // Cũng lọc ở đây: một tin ứng viên không được phép nộp thì không thể là
      // "việc làm phù hợp nhất", dù nó đứng đầu danh sách vì thiếu tin khác.
      this.prisma.jobMatch.findMany({
        where: eligible,
        orderBy: { overallScore: 'desc' },
        take: 3,
        include: {
          // Thẻ công việc có nút Lưu. Không kèm cờ này thì nút luôn hiện
          // "chưa lưu" kể cả với việc người dùng đã lưu từ màn hình khác.
          job: {
            include: { saves: { where: { userId }, select: { id: true } } },
          },
        },
      }),
      this.prisma.jobMatch.findMany({
        where: eligible,
        orderBy: { evaluatedAt: 'desc' },
        take: 5,
        select: {
          overallScore: true,
          technicalScore: true,
          experienceScore: true,
          behavioralScore: true,
          careerScore: true,
        },
      }),
      this.prisma.jobMatch.count({
        where: { userId, status: 'DONE', eligibility: 'FAIL' },
      }),
      // Tags của các tin đã chấm, dùng để tìm kỹ năng thị trường đòi mà hồ sơ
      // chưa có. Lấy tags thay vì `gaps`: gaps là câu văn do model viết, còn
      // tags là từ khóa chuẩn hóa - đếm được.
      this.prisma.jobMatch.findMany({
        where: { userId, status: 'DONE' },
        select: { job: { select: { tags: true } } },
        take: 100,
      }),
      this.applications.countsFor(userId),
      // TẤT CẢ tin đã chấm, kể cả tin bị loại. Các thẻ gợi ý dùng số này làm
      // mẫu số vì chúng nói về toàn bộ những gì đã đánh giá ("3/12 việc bị
      // loại"). Dùng nhầm số tin đủ điều kiện sẽ ra những câu vô nghĩa kiểu
      // "5/5 việc bị loại", hoặc tử số lớn hơn mẫu số.
      this.prisma.jobMatch.count({ where: { userId, status: 'DONE' } }),
    ]);

    const average = (values: Array<number | null>): number | null => {
      const numbers = values.filter((value): value is number => value !== null);
      if (!numbers.length) return null;
      return Math.round(
        numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
      );
    };

    const best = topMatches[0];
    const suggestionInput: SuggestionInput = {
      profileCompletion: profile?.completion ?? 0,
      missingProfileFields: missingFields(profile),
      recurringGaps: recurringGaps(scoredJobs, [
        ...(profile?.primarySkills ?? []),
        ...(profile?.secondarySkills ?? []),
      ]),
      // Mẫu số của các thẻ gợi ý là TỔNG tin đã chấm, không phải số tin đủ
      // điều kiện - xem ghi chú ở truy vấn totalScored bên trên.
      totalMatches: totalScored,
      topMatch: best
        ? {
            jobId: best.jobId,
            company: best.job.company,
            score: best.overallScore ?? 0,
            daysOld: Math.floor(
              (Date.now() - best.job.scrapedAt.getTime()) / ONE_DAY_MS,
            ),
          }
        : null,
      ineligibleCount,
    };

    return {
      profileCompletion: profile?.completion ?? 0,
      matchingJobs: { total: matchCount, newThisWeek },
      averageMatchScore: aggregate._avg.overallScore
        ? Math.round(aggregate._avg.overallScore)
        : null,
      // Làm phẳng `saves` thành cờ boolean, giống hệt cách MatchingService làm
      // ở /api/matches. Hai màn hình hiển thị cùng một thẻ công việc thì phải
      // nhận cùng một hình dạng dữ liệu.
      topMatches: topMatches.map(({ job: { saves, ...job }, ...match }) => ({
        ...match,
        job: { ...job, saved: saves.length > 0 },
      })),
      suggestions: buildSuggestions(suggestionInput),
      applications,
      /// "Điểm phù hợp hôm nay" trên giao diện: trung bình 5 lần chấm gần nhất.
      ///
      /// Bốn chiều ở đây đúng bằng bốn chiều CÓ TRỌNG SỐ trong
      /// `04-job-evaluation.md` (kỹ thuật 30, kinh nghiệm 25, hành vi 15,
      /// định hướng 30). Cố ý không có "mức lương": khung đánh giá không chấm
      /// lương, và mục Salary Benchmark thì đang bị cắt khỏi prompt. Bịa thêm
      /// một chiều mà khung không định nghĩa là bịa số.
      todayScore: {
        overall: average(recentFive.map((match) => match.overallScore)),
        skills: average(recentFive.map((match) => match.technicalScore)),
        experience: average(recentFive.map((match) => match.experienceScore)),
        behavioral: average(recentFive.map((match) => match.behavioralScore)),
        career: average(recentFive.map((match) => match.careerScore)),
        sampleSize: recentFive.length,
      },
    };
  }
}
