import { Injectable } from '@nestjs/common';
import { ProfileService } from '@/modules/profile/profile.service';
import { PrismaService } from '@/prisma/prisma.service';
import { toAutofill, type AutofillData } from './autofill-fields';

@Injectable()
export class ExtProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfileService,
  ) {}

  async skills(userId: string): Promise<{ skills: string[] }> {
    const profile = await this.profiles.get(userId);
    return {
      skills: Array.from(
        new Set([...profile.primarySkills, ...profile.secondarySkills]),
      ),
    };
  }

  async autofill(userId: string): Promise<AutofillData> {
    const [user, profile] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, email: true },
      }),
      this.profiles.get(userId),
    ]);
    return toAutofill(user, profile);
  }
}
