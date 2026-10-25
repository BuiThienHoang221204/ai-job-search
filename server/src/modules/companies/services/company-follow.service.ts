import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { companyKeyOf } from '../utils/company-key';

const MAX_FOLLOWS = 50;

const FOLLOW_FIELDS = { id: true, companyKey: true, name: true };

@Injectable()
export class CompanyFollowService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.companyFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: FOLLOW_FIELDS,
    });
  }

  /** Theo dõi công ty của tin `jobId`; đã theo dõi rồi thì trả lại bản cũ. */
  async follow(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { company: true },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    const companyKey = companyKeyOf(job.company);
    if (!companyKey) {
      throw new BadRequestException(
        'Tin này không ghi tên công ty nên chưa theo dõi được.',
      );
    }

    const count = await this.prisma.companyFollow.count({ where: { userId } });
    if (count >= MAX_FOLLOWS) {
      throw new BadRequestException(
        `Bạn đang theo dõi đủ ${MAX_FOLLOWS} công ty. Bỏ bớt một công ty ở Tài khoản rồi theo dõi tiếp.`,
      );
    }

    try {
      return await this.prisma.companyFollow.create({
        data: { userId, companyKey, name: job.company },
        select: FOLLOW_FIELDS,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.companyFollow.findUniqueOrThrow({
        where: { userId_companyKey: { userId, companyKey } },
        select: FOLLOW_FIELDS,
      });
    }
  }

  async unfollow(userId: string, id: string) {
    const { count } = await this.prisma.companyFollow.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('Bạn không theo dõi công ty này');
    return { removed: count };
  }
}
