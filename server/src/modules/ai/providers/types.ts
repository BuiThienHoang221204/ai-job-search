export type ProviderDescriptor = {
  id: string;
  label: string;
  apiKeyEnv: string;
  userAgentEnv?: string;
  baseURLEnv?: string;
  maxConcurrencyEnv?: string;
  honorsResponseFormat?: boolean;
  extraHeaders?: Record<string, string>;
  explicitStreamFlag?: boolean;
  dropJsonMode?: boolean;
  declaresStructuredOutput?: (entry: Record<string, unknown>) => boolean;
  knownNoStructuredOutput?: readonly string[];
  streamsJson?: readonly string[] | 'all';
  rateLimitFor?: (modelId: string) => readonly RateLimitSpec[] | undefined;
  staticModels?: readonly string[];
  defaultMaxOutputTokens?: number;
};

export type RateLimitSpec = {
  kind: 'count' | 'token';
  windowMs: number;
  limit: number;
};
