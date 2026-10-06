export const QUEUE = {
  EVALUATE_MATCH: 'match.evaluate',
  INTERVIEW_PREP: 'interview.prep',
  UPSKILL_REPORT: 'upskill.report',
  GENERATE_DOCUMENT: 'document.generate',
  SCRAPE_RUN: 'scrape.run',
  PROFILE_SYNTHESIZE: 'profile.synthesize',
  EXTRACT_REQUIREMENTS: 'job.requirements',
  COMPANY_BRIEF: 'company.brief',
  REQUIREMENT_MATCH: 'match.requirements',
  SKILL_CANONICALIZE: 'skill.canonicalize',
  AI_SHORTLIST: 'match.shortlist',
} as const;

export const QUEUE_POLICY = 'exclusive';
