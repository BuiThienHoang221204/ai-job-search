import type { QueueService } from './queue.service';

export type ExtractRequirementsPayload = {
  jobIds: string[];
  force?: boolean;
};

export type RequirementMatchPayload = {
  jobId?: string;
  userId?: string;
};

export type SkillCanonicalizePayload = RequirementMatchPayload & {
  round?: number;
};

export type AiShortlistPayload = { userId?: string };

export type EvaluateMatchPayload = {
  userId: string;
  jobId: string;
  force?: boolean;
};

export type InterviewPrepPayload = {
  userId: string;
  jobId: string;
  force?: boolean;
};

export type CompanyBriefPayload = {
  nameKey: string;
  company: string;
  force?: boolean;
};

export type UpskillReportPayload = {
  userId: string;
  reportId: string;
};

export type GenerateDocumentPayload = {
  userId: string;
  documentId: string;
};

export type ProfileSynthesizePayload = {
  userId: string;
  draftId: string;
};

export type ScrapeRunPayload = {
  runId: string;
  userId?: string;
};

export type Queue = Pick<QueueService, 'send' | 'sendMany' | 'work' | 'status'>;

export type QueueStatus = { ready: boolean; error: string | null };

export type QueueStatsItem = {
  name: string;
  concurrency: number;
  size: number;
  active: number;
  total: number;
};

export type QueueStats = {
  queues: QueueStatsItem[];
  totalWaiting: number;
  totalActive: number;
};

export type QueueConfigItem = {
  queueName: string;
  concurrency: number;
  serial: boolean;
  note: string | null;
};
