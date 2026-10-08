import type { JobSeniority } from '@/generated/prisma/client';

export type ProfileFit = {
  occupationCode: string | null;
  experienceLevel: JobSeniority | null;
};
