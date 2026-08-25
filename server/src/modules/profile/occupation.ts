import { resolveOccupation } from '../jobs/taxonomy/resolve.js';
import { jobTitleOf } from './headline.js';

export type OccupationSource = {
  headline: string | null;
  primarySkills: string[];
};

export function profileOccupation(profile: OccupationSource): string | null {
  const headline = jobTitleOf(profile.headline ?? '');
  const skills = profile.primarySkills.filter((skill) => skill.trim());

  if (!headline && !skills.length) return null;
  return resolveOccupation(headline, skills);
}
