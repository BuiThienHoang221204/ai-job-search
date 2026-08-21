import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ToolSet } from 'ai';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import { STORAGE, type Storage } from '../storage/storage.interface.js';
import {
  LATEX_COMPILER,
  type LatexCompiler,
} from '../documents/latex-compile.js';
import type {
  AgentLimits,
  ArtifactRecord,
  ToolContext,
  ToolDeps,
} from './agent.types.js';
import { buildToolSet } from './tools/index.js';

/**
 * Cầu nối giữa DI của Nest và các tool - vốn là hàm thuần nhận phụ thuộc.
 *
 * Chỉ có đúng một việc: gom service đã inject cùng các con số cấu hình thành
 * `ToolDeps` rồi giao cho `buildToolSet`. Nhờ vậy mỗi tool test được bằng một
 * object phụ thuộc tự dựng, không cần khởi động module Nest nào.
 */
@Injectable()
export class AgentToolsService {
  private readonly deps: Omit<ToolDeps, 'limits'>;

  constructor(
    prisma: PrismaService,
    ai: AiService,
    skills: SkillRegistryService,
    prompts: PromptBuilderService,
    private readonly config: ConfigService,
    @Inject(STORAGE) storage: Storage,
    @Inject(LATEX_COMPILER) latex: LatexCompiler,
  ) {
    this.deps = { prisma, ai, skills, prompts, storage, latex };
  }

  /** Đọc mọi trần từ cấu hình một lần, để tool không phải hỏi lại. */
  limits(): AgentLimits {
    const read = <T>(key: string): T => this.config.get<T>(`agent.${key}`)!;

    return {
      maxSteps: read<number>('maxSteps'),
      reviewerMaxSteps: read<number>('reviewerMaxSteps'),
      timeoutMs: read<number>('timeoutMs'),
      fetchTimeoutMs: read<number>('fetchTimeoutMs'),
      fetchMaxBytes: read<number>('fetchMaxBytes'),
      templatesRoot: read<string>('templatesRoot'),
      search: {
        apiKey: read<string>('searchApiKey'),
        url: read<string>('searchUrl'),
        maxResults: read<number>('searchMaxResults'),
      },
    };
  }

  build(context: ToolContext): {
    tools: ToolSet;
    artifacts: ArtifactRecord[];
  } {
    return buildToolSet({ ...this.deps, limits: this.limits() }, context);
  }
}
