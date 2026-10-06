import { UnauthorizedException } from '@nestjs/common';
import type { GoogleProfile } from '../modules/auth/google-auth.service';

export class FakeGoogleAuth {
  private readonly profiles = new Map<string, GoogleProfile>();

  willReturn(idToken: string, profile: GoogleProfile): this {
    this.profiles.set(idToken, profile);
    return this;
  }

  verify(idToken: string): Promise<GoogleProfile> {
    const profile = this.profiles.get(idToken);
    if (!profile) throw new UnauthorizedException('Token Google không hợp lệ');
    return Promise.resolve(profile);
  }

  reset(): void {
    this.profiles.clear();
  }
}
