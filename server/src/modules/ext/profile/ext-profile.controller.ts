import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { ProfileService } from '@/modules/profile/profile.service';
import { ExtAuth } from '../auth/ext-auth.decorator';

@ExtAuth()
@Controller('ext/profile')
export class ExtProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<{ skills: string[] }> {
    const profile = await this.profile.get(user.id);
    return {
      skills: Array.from(
        new Set([...profile.primarySkills, ...profile.secondarySkills]),
      ),
    };
  }
}
