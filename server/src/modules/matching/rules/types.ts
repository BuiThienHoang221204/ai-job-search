export type CheckKind = 'SKILL' | 'NICE' | 'YEARS' | 'ELIGIBILITY' | 'LOCATION';

export type RequirementCheck = {
  label: string;
  kind: CheckKind;
  met: boolean | null;
  note?: string;
  via?: string;
};

export type MatchProfile = {
  skills: string[];
  citizenship: string | null;
  workPermit: string | null;
  location: string | null;
  willingToRelocate: boolean;
  years: number | null;
};

export type RequirementMatch = {
  checks: RequirementCheck[];
  met: number;
  total: number;
  skillMet: number;
  skillTotal: number;
  score: number;
  rank: number;
  eligibility: 'PASS' | 'FAIL' | 'UNVERIFIED';
};

export type SkillDictionary = ReadonlyMap<string, string>;

export type Candidate = {
  userId: string;
  profile: MatchProfile;
  stamp: string;
};

export type ShortlistRow = {
  userId: string;
  jobId: string;
  rank: number;
};

export type ShortlistCandidate = {
  userId: string;
  lastFanOutAt: Date | null;
  jobIds: string[];
};

export type ShortlistInput = {
  rows: ShortlistRow[];
  lastFanOutAt: Map<string, Date | null>;
  topN?: number;
  maxPerRun?: number;
};

export type ShortlistTarget = { userId: string; jobId: string };

export type ShortlistPlan = {
  targets: ShortlistTarget[];
  served: string[];
  deferred: number;
};

export type ShortlistResult = {
  queued: number;
  served: number;
  deferred: number;
};
