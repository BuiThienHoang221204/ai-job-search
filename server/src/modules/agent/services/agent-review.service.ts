import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ToolSet } from 'ai';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import { STORAGE, type Storage } from '../../storage/storage.interface.js';
import type { AgentInput, ArtifactRecord, ReadLog } from '../agent.types.js';
import { readProfileTool } from '../tools/read-profile.tool.js';
import { readSkillReferenceTool } from '../tools/read-skill-reference.tool.js';
import { webSearchTool } from '../tools/web-search.tool.js';
import { AgentToolsService } from './agent-tools.service.js';
import { reviewerPrompt, reviewerSystem } from '../prompts/reviewer-prompt.js';

export type ReviewRecord =
  | { status: 'PENDING' }
  | { status: 'DONE'; critique: string; at: string }
  | { status: 'FAILED'; error: string; at: string };

@Injectable()
export class AgentReviewService {
  private readonly logger = new Logger(AgentReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly toolbox: AgentToolsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  async review(runId: string): Promise<void> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        userId: true,
        input: true,
        result: true,
        job: { select: { title: true, company: true, description: true } },
      },
    });
    if (!run) return;

    try {
      const draft = await this.draft(run.userId, run.result);
      if (!draft) {
        await this.save(runId, {
          status: 'FAILED',
          error: 'Lượt chạy không ghi được tài liệu nào để phản biện',
          at: new Date().toISOString(),
        });
        return;
      }

      const input = (run.input ?? {}) as AgentInput;
      const result = await this.ai.runTools({
        system: reviewerSystem(),
        prompt: reviewerPrompt({
          role: run.job?.title ?? 'Vị trí ứng tuyển',
          company: run.job?.company ?? 'Công ty',
          posting: run.job?.description ?? input.jobDescription ?? '',
          draft,
        }),
        tools: this.reviewerTools(run.userId),
        context: { purpose: 'agent.reviewer', userId: run.userId },
        maxSteps: this.toolbox.limits().reviewerMaxSteps,
        timeoutMs: this.toolbox.limits().timeoutMs,
      });

      await this.save(runId, {
        status: 'DONE',
        critique: result.text,
        at: new Date().toISOString(),
      });
      this.logger.log(
        `Phản biện xong lượt ${runId} sau ${result.steps.length} bước`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Phản biện lượt ${runId} thất bại: ${message}`);
      await this.save(runId, {
        status: 'FAILED',
        error: message,
        at: new Date().toISOString(),
      });
    }
  }

  private reviewerTools(userId: string): ToolSet {
    const deps = this.toolbox.reviewerDeps();
    const context = { runId: 'review', userId };
    const seen: ReadLog = new Set();

    const tools: ToolSet = {
      read_profile: readProfileTool(deps, context, seen),
      read_skill_reference: readSkillReferenceTool(deps, seen),
    };
    if (deps.limits.search.apiKey) {
      tools.web_search = webSearchTool(deps);
    }
    return tools;
  }

  private async draft(
    userId: string,
    result: Prisma.JsonValue | null,
  ): Promise<string> {
    const artifacts =
      (result as { artifacts?: ArtifactRecord[] } | null)?.artifacts ?? [];

    const parts: string[] = [];
    for (const artifact of artifacts) {
      if (!artifact.key.startsWith(`${userId}/`)) continue;
      try {
        parts.push(
          `--- ${artifact.name} ---\n${await this.storage.readText(artifact.key)}`,
        );
      } catch {
        continue;
      }
    }
    return parts.join('\n\n');
  }

  private async save(runId: string, review: ReviewRecord): Promise<void> {
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: { review: review },
    });
  }
}
