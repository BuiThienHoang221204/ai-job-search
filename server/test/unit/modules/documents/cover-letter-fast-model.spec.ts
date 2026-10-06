import type { Document } from 'src/generated/prisma/client.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { SkillRegistryService } from 'src/modules/skills/services/skill-registry.service.js';
import type { PromptBuilderService } from 'src/modules/skills/services/prompt-builder.service.js';
import type { LetterTarget } from 'src/modules/documents/utils/letter-target.js';

jest.mock('src/modules/ai/services/ai.service.js', () => ({
  AiService: class {},
}));

import { DocumentComposer } from 'src/modules/documents/services/document-composer.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';

type GenerateObjectOptionsMock = {
  prompt: string;
  context: { purpose: string };
  modelId?: string;
  fallbackModelIds?: string[];
};

type StreamObjectOptionsMock = {
  prompt: string;
  context: { purpose: string };
  modelId?: string;
  fallbackModelIds?: string[];
};

const mockPrisma = {
  jobMatch: { findUnique: jest.fn().mockResolvedValue(null) },
} as unknown as PrismaService;

const mockSkills = {
  get: () => ({
    references: new Map([
      ['06-cover-letter-templates.md', 'khung thư'],
      ['03-writing-style.md', 'quy tắc viết'],
    ]),
  }),
} as unknown as SkillRegistryService;

const mockPrompts = {
  profileSummary: () => 'tóm tắt hồ sơ',
  keepSections: (text: string) => text,
  render: (text: string) => text,
} as unknown as PromptBuilderService;

const doc = {
  id: 'doc-1',
  userId: 'user-1',
  title: 'Thư xin việc',
  kind: 'COVER_LETTER',
  content: {},
  jobId: 'job-1',
  language: 'VI',
  templateId: 'classic',
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Document;

const target: LetterTarget = {
  jobId: 'job-1',
  company: 'FPT',
  title: 'Kỹ sư phần mềm',
  description: 'Lập trình TypeScript',
};

describe('DocumentComposer — coverLetter và streamCoverLetter sử dụng fastModelChain', () => {
  const ORIGINAL_MODEL = process.env.AI_FAST_MODEL_ID;
  const ORIGINAL_FALLBACKS = process.env.AI_FAST_FALLBACK_IDS;

  afterEach(() => {
    if (ORIGINAL_MODEL === undefined) delete process.env.AI_FAST_MODEL_ID;
    else process.env.AI_FAST_MODEL_ID = ORIGINAL_MODEL;
    if (ORIGINAL_FALLBACKS === undefined)
      delete process.env.AI_FAST_FALLBACK_IDS;
    else process.env.AI_FAST_FALLBACK_IDS = ORIGINAL_FALLBACKS;
  });

  test('coverLetter truyền modelId và fallbackModelIds khi có cấu hình AI_FAST_*', async () => {
    process.env.AI_FAST_MODEL_ID = 'groq/openai/gpt-oss-120b';
    process.env.AI_FAST_FALLBACK_IDS = 'gemini/models/gemini-3.5-flash-lite';

    const generateObject = jest.fn<
      Promise<{ object: Record<string, unknown>; modelId: string }>,
      [GenerateObjectOptionsMock]
    >(() =>
      Promise.resolve({
        object: {
          salutation: 'Kính gửi',
          opening: 'Tôi muốn ứng tuyển',
          bodyParagraphs: ['Đoạn 1'],
          motivation: 'Vì công ty tốt',
          closing: 'Trân trọng',
        },
        modelId: 'groq/openai/gpt-oss-120b',
      }),
    );

    const composer = new DocumentComposer(
      mockPrisma,
      { generateObject } as unknown as AiService,
      mockSkills,
      mockPrompts,
    );

    const result = await composer.compose({
      document: doc,
      profile: null,
      target,
      params: {},
      identity: { name: 'Nguyễn Văn A', email: 'a@example.com' },
    });

    expect(generateObject).toHaveBeenCalledTimes(1);
    const options = generateObject.mock.calls[0][0];
    expect(options.context.purpose).toBe('document.coverLetter');
    expect(options.modelId).toBe('groq/openai/gpt-oss-120b');
    expect(options.fallbackModelIds).toEqual([
      'gemini/models/gemini-3.5-flash-lite',
    ]);
    expect(result.modelId).toBe('groq/openai/gpt-oss-120b');
  });

  test('streamCoverLetter truyền modelId và fallbackModelIds tương tự', async () => {
    process.env.AI_FAST_MODEL_ID = 'groq/openai/gpt-oss-120b';
    process.env.AI_FAST_FALLBACK_IDS = 'unorouter/m1:free';

    const streamObject = jest.fn<
      Promise<{
        partials: unknown[];
        object: Promise<Record<string, unknown>>;
        modelId: string;
      }>,
      [StreamObjectOptionsMock]
    >(() =>
      Promise.resolve({
        partials: [],
        object: Promise.resolve({}),
        modelId: 'groq/openai/gpt-oss-120b',
      }),
    );

    const composer = new DocumentComposer(
      mockPrisma,
      { streamObject } as unknown as AiService,
      mockSkills,
      mockPrompts,
    );

    await composer.streamCoverLetter(doc, null, target);

    expect(streamObject).toHaveBeenCalledTimes(1);
    const options = streamObject.mock.calls[0][0];
    expect(options.context.purpose).toBe('document.coverLetter');
    expect(options.modelId).toBe('groq/openai/gpt-oss-120b');
    expect(options.fallbackModelIds).toEqual(['unorouter/m1:free']);
  });

  test('không cấu hình AI_FAST_* thì modelId và fallbackModelIds là undefined (dùng chuỗi mặc định)', async () => {
    delete process.env.AI_FAST_MODEL_ID;
    delete process.env.AI_FAST_FALLBACK_IDS;

    const generateObject = jest.fn<
      Promise<{ object: Record<string, unknown>; modelId: string }>,
      [GenerateObjectOptionsMock]
    >(() =>
      Promise.resolve({
        object: {},
        modelId: 'default-model',
      }),
    );

    const composer = new DocumentComposer(
      mockPrisma,
      { generateObject } as unknown as AiService,
      mockSkills,
      mockPrompts,
    );

    await composer.compose({
      document: doc,
      profile: null,
      target,
      params: {},
      identity: { name: 'Nguyễn Văn A', email: 'a@example.com' },
    });

    const options = generateObject.mock.calls[0][0];
    expect(options.modelId).toBeUndefined();
    expect(options.fallbackModelIds).toBeUndefined();
  });
});
