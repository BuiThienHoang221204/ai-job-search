import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MINUTE_MS } from '@/common/duration';

const TOKEN_URL =
  'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';

const TOKEN_TIMEOUT_MS = 10_000;

@Injectable()
export class LiveTokenService {
  private readonly logger = new Logger(LiveTokenService.name);

  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<Record<string, string>>('ai.apiKeys')!.gemini;
  }

  async create(
    setup: Record<string, unknown>,
    expiresAt: Date,
  ): Promise<string> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: expiresAt.toISOString(),
        newSessionExpireTime: new Date(Date.now() + MINUTE_MS).toISOString(),
        bidiGenerateContentSetup: setup,
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });

    const body: unknown = await response.json().catch(() => null);
    const name = (body as { name?: unknown } | null)?.name;
    if (!response.ok || typeof name !== 'string') {
      this.logger.error(
        `Cấp token Gemini Live hỏng (${response.status}): ${JSON.stringify(body)?.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'Chưa mở được buổi luyện bằng giọng nói, thử lại sau ít phút hoặc luyện bằng chữ.',
      );
    }
    return name;
  }
}
