import { tool } from 'ai';
import { z } from 'zod';
import type { DocumentKind } from '../../../generated/prisma/client.js';
import {
  coverLetterSchema,
  cvSchema,
} from '../../documents/document.schema.js';
import type { ArtifactRecord, ToolContext, ToolDeps } from '../agent.types.js';

const MAX_PER_KIND = 2;

const saveDocumentTool = (
  deps: ToolDeps,
  context: ToolContext,
  artifacts: ArtifactRecord[],
  spec: {
    kind: DocumentKind;
    label: string;
    description: string;
    schema: z.ZodType;
  },
) => {
  let saved = 0;

  return tool({
    description: spec.description,
    inputSchema: z.object({
      title: z
        .string()
        .describe('Tên gợi nhớ, ví dụ "CV — Kế toán tổng hợp @ Vinamilk"'),
      content: spec.schema,
    }),
    execute: async ({ title, content }) => {
      if (saved >= MAX_PER_KIND) {
        return {
          error: `Đã lưu ${spec.label} ${saved} lần trong lượt này - đủ rồi. Bản đang có vẫn nguyên và sẽ được giao cho người dùng, họ tự sửa tiếp được. Đừng lưu lại nữa.`,
        };
      }

      try {
        const document = await deps.documents.saveFromAgent({
          userId: context.userId,
          agentRunId: context.runId,
          kind: spec.kind,
          jobId: context.jobId ?? null,
          title: title.slice(0, 200),
          content: content as object,
        });

        saved += 1;
        artifacts.push({
          name: `${spec.kind.toLowerCase()}:${document.id}`,
          key: document.storageKey ?? document.id,
          bytes: JSON.stringify(content).length,
          documentId: document.id,
          kind: spec.kind,
        });

        return {
          saved: spec.label,
          documentId: document.id,
          note: 'Đã lưu thành tài liệu người dùng sửa và tải PDF được. ĐỪNG viết lại nội dung này ra file khác.',
        };
      } catch (error) {
        return {
          error: `Không lưu được ${spec.label}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });
};

export const saveCvTool = (
  deps: ToolDeps,
  context: ToolContext,
  artifacts: ArtifactRecord[],
) =>
  saveDocumentTool(deps, context, artifacts, {
    kind: 'CV',
    label: 'CV',
    description:
      'Lưu CV đã may đo cho vị trí này. Chỉ đưa NỘI DUNG có cấu trúc - đừng viết LaTeX, HTML hay bất kỳ mã trình bày nào. Hệ thống tự dựng bản in và người dùng tự chọn mẫu.',
    schema: cvSchema('vi'),
  });

export const saveCoverLetterTool = (
  deps: ToolDeps,
  context: ToolContext,
  artifacts: ArtifactRecord[],
) =>
  saveDocumentTool(deps, context, artifacts, {
    kind: 'COVER_LETTER',
    label: 'thư xin việc',
    description:
      'Lưu thư xin việc cho vị trí này. Chỉ đưa NỘI DUNG có cấu trúc, đừng viết LaTeX. Chỉ gọi khi người dùng CÓ yêu cầu thư.',
    schema: coverLetterSchema,
  });
