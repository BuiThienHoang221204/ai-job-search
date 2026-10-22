import { resolve } from 'node:path';

const fromServerRoot = (relative: string) => resolve(process.cwd(), relative);

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Biến môi trường ${name} phải là số nguyên, nhận "${raw}"`);
  }
  return value;
}

function csv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// eslint-disable-next-line complexity
const configuration = () => ({
  port: int('PORT', 4_000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  trustProxyHops: int('TRUST_PROXY', 0) || 0,

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',

    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },

  ai: {
    provider: process.env.MODEL_PROVIDER ?? 'omniroute',
    modelId: process.env.MODEL_ID ?? '',

    chainBudgetMs: int('AI_CHAIN_BUDGET_MS', 240_000),

    fallbackModelIds: csv('MODEL_FALLBACK_IDS', ''),

    fastModelId: process.env.AI_FAST_MODEL_ID ?? '',
    fastFallbackModelIds: csv('AI_FAST_FALLBACK_IDS', ''),
    mainProviders: csv(
      'MAIN_TASK_PROVIDERS',
      'opencode-direct,opencode,omniroute,openrouter',
    ),
    fastProviders: csv(
      'FAST_TASK_PROVIDERS',
      'groq,gemini,unorouter,omniroute,kilo,openrouter',
    ),

    healthcheck: {
      enabled: process.env.AI_HEALTHCHECK_ENABLED !== 'false',
      schedule: process.env.AI_HEALTHCHECK_SCHEDULE ?? '35 23 * * *',
      probeTimeoutMs: int('AI_PROBE_TIMEOUT_MS', 6_000),
      circuitBreakerThreshold: int('AI_CIRCUIT_BREAKER_THRESHOLD', 2),
      circuitBreakerCooldownMs: int('AI_CIRCUIT_BREAKER_COOLDOWN_MS', 900_000),
    },

    apiKeys: {
      opencode: process.env.AI_API_KEY ?? 'public',
      'opencode-direct': process.env.OPENCODE_DIRECT_API_KEY ?? 'public',
      openrouter: process.env.OPENROUTER_API_KEY ?? '',
      omniroute: process.env.OMNIROUTE_API_KEY ?? 'public',
      kilo: process.env.KILO_API_KEY ?? 'public',
      groq: process.env.GROQ_API_KEY ?? '',
      unorouter: process.env.UNOROUTER_API_KEY ?? '',
      gemini: process.env.GOOGLE_GEMINI_API_KEY ?? '',
    } as Record<string, string>,

    userAgents: {
      opencode: process.env.OPENCODE_USER_AGENT ?? 'opencode',
    } as Record<string, string>,

    baseURLs: {
      omniroute: process.env.OMNIROUTE_BASE_URL ?? 'http://localhost:20128/v1',
      opencode: process.env.OPENCODE_SERVICE_URL ?? '',
      'opencode-direct':
        process.env.OPENCODE_DIRECT_BASE_URL ??
        'https://opencode.ai/inference/v1',
      groq: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
      unorouter:
        process.env.UNOROUTER_BASE_URL ?? 'https://api.unorouter.com/v1',
      gemini:
        process.env.GOOGLE_GEMINI_BASE_URL ??
        'https://generativelanguage.googleapis.com/v1beta/openai',
    } as Record<string, string>,

    maxConcurrency: {
      opencode: Number(process.env.OPENCODE_APP_CONCURRENCY) || 2,
      'opencode-direct': Number(process.env.OPENCODE_DIRECT_CONCURRENCY) || 5,
    } as Record<string, number | undefined>,

    catalogUrl:
      process.env.OPENCODE_MODELS_URL ?? 'https://models.opencode.ai/api.json',

    structuredOutputs: (process.env.AI_STRUCTURED_OUTPUTS ?? 'true') === 'true',
  },

  skills: {
    dir: fromServerRoot(process.env.SKILLS_DIR ?? '../.claude/skills'),
  },

  web: {
    fetchMaxBytes: int('AGENT_FETCH_MAX_BYTES', 2_000_000),
    fetchTimeoutMs: int('AGENT_FETCH_TIMEOUT_MS', 20_000),
    search: {
      maxResults: int('SERPER_MAX_RESULTS', 5),
      tavily: {
        apiKey: process.env.TAVILY_API_KEY ?? '',
        url: process.env.TAVILY_URL ?? 'https://api.tavily.com/search',
      },
      serper: {
        apiKey: process.env.SERPER_API_KEY ?? '',
        url: process.env.SERPER_URL ?? 'https://google.serper.dev/search',
      },
    },
  },

  scraper: {
    timeoutMs: int('SCRAPER_TIMEOUT_MS', 60_000),

    portalsDir: fromServerRoot(process.env.PORTALS_DIR ?? '../.agents/skills'),

    portalDelayMs: int('SCRAPER_PORTAL_DELAY_MS', 3_000),

    defaultLocation: process.env.SCRAPER_DEFAULT_LOCATION ?? 'Vietnam',

    maxJobsPerPortal: int('SCRAPER_MAX_JOBS_PER_PORTAL', 100),

    maxAgeDays: int('SCRAPER_MAX_AGE_DAYS', 7),

    maxPages: int('SCRAPER_MAX_PAGES', 5),

    requirePostedAt: process.env.SCRAPER_REQUIRE_POSTED_AT === 'true',

    systemQueryLimit: int('SCRAPER_SYSTEM_QUERY_LIMIT', 30),

    autoScore: process.env.SCRAPER_AUTO_SCORE === 'true',
  },

  matching: {
    minPercent: int('MATCH_MIN_PERCENT', 50),

    dictionaryModelId: process.env.SKILL_DICTIONARY_MODEL_ID || undefined,

    aiAuto: process.env.MATCH_AI_AUTO === 'true',
    aiTopN: int('MATCH_AI_TOP_N', 3),
    aiMaxPerRun: int('MATCH_AI_MAX_PER_RUN', 300),
    aiCooldownHours: int('MATCH_AI_COOLDOWN_HOURS', 6),
  },

  cron: {
    scrapeEnabled: process.env.SCRAPE_CRON_ENABLED !== 'false',
    scrapeSchedule: process.env.SCRAPE_CRON_SCHEDULE ?? '0 23 * * *',
    timezone: process.env.CRON_TIMEZONE ?? 'Asia/Ho_Chi_Minh',

    reconcileEnabled: process.env.RECONCILE_CRON_ENABLED !== 'false',
    reconcileSchedule: process.env.RECONCILE_CRON_SCHEDULE ?? '*/10 * * * *',
  },

  throttle: {
    ttlMs: int('THROTTLE_TTL_MS', 60_000),
    limit: int('THROTTLE_LIMIT', 120),

    disabled: process.env.THROTTLE_DISABLED === 'true',
  },

  pdf: {
    serviceUrl: process.env.PDF_SERVICE_URL?.replace(/\/$/, '') ?? null,
  },

  storage: {
    r2Endpoint: process.env.R2_ENDPOINT ?? '',
    r2Bucket: process.env.R2_BUCKET ?? '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export default configuration;
