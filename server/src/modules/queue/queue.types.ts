import type { QueueService } from './queue.service.js';

export type ExtractRequirementsPayload = {
  jobIds: string[];
  force?: boolean;
};

/** Một phía là đủ: có `jobId` thì tính lại theo tin, có `userId` thì theo hồ sơ. */
export type RequirementMatchPayload = {
  jobId?: string;
  userId?: string;
};

/** `round` = quét toàn kho, mỗi lượt một lô rồi tự xếp lượt kế. */
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

/** Không có `userId`: bản tìm hiểu công ty dùng chung cho mọi người dùng. */
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
  /** Vắng mặt khi đây là lượt quét của hệ thống — chủ sở hữu đã nằm trong chính bản ghi `ScrapeRun`. */
  userId?: string;
};

/** Mặt tiếp xúc các module khác dùng. KHÔNG có `getStats`: chỉ `health.controller` cần nó, và nó gọi thẳng `QueueService`. */
export type Queue = Pick<QueueService, 'send' | 'sendMany' | 'work' | 'status'>;

/** Trạng thái khởi tạo hàng đợi, dùng cho readiness probe. */
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

/** Một dòng cấu hình hàng đợi đọc từ database. */
export type QueueConfigItem = {
  queueName: string;
  concurrency: number;
  serial: boolean;
  note: string | null;
};
