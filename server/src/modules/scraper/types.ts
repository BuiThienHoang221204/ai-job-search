export type PortalJobCard = {
  id: string;
  slug: string;
  title: string;
  company: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  location: string | null;
  workMode: string | null;
  salary: string | null;
  postedAt: string | null;
  tags: string[];
  url: string;
  description?: string | null;
};

export type PortalJobDetail = PortalJobCard & { description: string | null };

export type SearchArgs = {
  query?: string;
  location?: string;
  remote?: 'remote' | 'hybrid' | 'onsite';
  page?: number;
  limit?: number;
  postedWithinDays?: number;
};

export type PortalEntry = {
  key: string;
  directory: string;
  cliPath: string;
  enabled: boolean;
  supportsJobAge: boolean;
  delayMs: number | null;
  occupations: string[] | null;
  description: string;
};

export interface JobSource {
  reload(): Promise<PortalEntry[]>;
  listPortals(): string[];
  describePortals(): PortalEntry[];
  has(portal: string): boolean;
  search(portal: string, args: SearchArgs): Promise<PortalJobCard[]>;
  detail(portal: string, slug: string): Promise<PortalJobDetail>;
}

export type PlannedQuery = {
  query: string;
  location: string;
  rationale: string;
};

export type QueryProfile = {
  headline: string | null;
  location: string | null;
  primarySkills: string[];
  targetSectors: string[];
  subOccupationCode: string | null;
};

export type ProfileCluster = {
  clusterCode: string;
  query: string;
  size: number;
};

export type ClusterProfile = {
  headline: string | null;
  primarySkills: string[];
  occupationCode: string | null;
};

export type CollectLimits = {
  maxJobsPerPortal: number;
  maxPages: number;
  maxAgeDays: number;
  requirePostedAt: boolean;
  defaultLocation: string;
};

export type QueryCursor = {
  query: PlannedQuery;
  page: number;
  taken: number;
  done: boolean;
  pending: PortalJobCard[];
  gained: number;
  requested: boolean;
  error?: unknown;
};

export type CollectDeps = {
  search: (portal: string, args: SearchArgs) => Promise<PortalJobCard[]>;
  log: (message: string) => void;
  limits: CollectLimits;
};

export type CollectOutcome = {
  cards: PortalJobCard[];
  askedIndices: number[];
};

export type SaveResult =
  { kind: 'saved'; jobId: string } | { kind: 'skipped' } | { kind: 'merged' };

export type SaveOutcome = {
  savedJobIds: string[];
  found: number;
  fresh: number;
  skipped: number;
  merged: number;
};

export type ScoreTarget = { userId: string; jobId: string };

export type FanOutJob = {
  id: string;
  text: string;
};

export type FanOutUser = {
  id: string;
  completion: number;
  skills: string[];
};

export type FanOutInput = {
  jobs: FanOutJob[];
  users: FanOutUser[];
  alreadyScored: Iterable<string>;
  perUserLimit?: number;
};

export type FanOutResult = {
  targets: ScoreTarget[];
  dropped: number;
  skippedThinProfiles: number;
  skippedNoOverlap: number;
};
