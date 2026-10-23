import type { JobSeniority } from '@/generated/prisma/client';

export type ProfileFit = {
  occupationCode: string | null;
  subOccupationCodes: string[];
  preferredProvinces: string[];
  experienceLevel: JobSeniority | null;
};
