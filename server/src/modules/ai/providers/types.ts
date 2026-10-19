import type { ResolvedModel } from '../ai.types';

export type CustomFetchContext = {
  resolved: ResolvedModel;
  jsonStream: boolean;
};

export type ProviderDescriptor = {
  id: string;
  label: string;
  apiKeyEnv: string;
  userAgentEnv?: string;
  baseURLEnv?: string;
  honorsResponseFormat?: boolean;
  extraHeaders?: Record<string, string>;
  explicitStreamFlag?: boolean;
  dropJsonMode?: boolean;
  declaresStructuredOutput?: (entry: Record<string, unknown>) => boolean;
  knownNoStructuredOutput?: readonly string[];
  streamsJson?: readonly string[] | 'all';
  rateLimitFor?: (modelId: string) => readonly RateLimitSpec[] | undefined;
  filterModel?: (id: string) => boolean;
  customFetch?: (
    originalFetch: typeof fetch,
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    context: CustomFetchContext,
  ) => Promise<Response>;
};

export type RateLimitSpec = {
  kind: 'count' | 'token';
  windowMs: number;
  limit: number;
};
