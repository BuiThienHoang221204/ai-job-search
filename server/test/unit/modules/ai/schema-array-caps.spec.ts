import type { ZodType } from 'zod';
import {
  applicationEmailSchema,
  coverLetterSchema,
  cvEditSchema,
  cvSchema,
  formAnswerSchema,
} from 'src/modules/documents/document.schema.js';
import { interviewPrepSchema } from 'src/modules/interview/interview.schema.js';
import {
  upskillGapsSchema,
  upskillPlanSchema,
} from 'src/modules/upskill/upskill.schema.js';
import { profileProposalSchema } from 'src/modules/profile-sources/profile-proposal.schema.js';
import { searchPlanSchema } from 'src/modules/scraper/planning/search-plan.schema.js';
import { evaluationSchema } from 'src/modules/matching/schemas/evaluation.schema.js';
import { jobRequirementsSchema } from 'src/modules/matching/schemas/job-requirements.schema.js';
import { skillMergeSchema } from 'src/modules/matching/schemas/skill-merge.schema.js';
import { companyBriefSchema } from 'src/modules/companies/brief/company-brief.schema.js';

/**
 * Canh trần SỐ LƯỢNG trên schema của MODEL phải là `.transform(slice)`, không
 * được là `.max()`.
 *
 * `.max()` trên mảng nghĩa là model liệt kê thừa MỘT mục thì zod từ chối, và vì
 * lỗi schema cố ý không đi tiếp chuỗi dự phòng nên cả lượt gọi mất trắng. Đã
 * hỏng thật: `bodyParagraphs` có `.min(1).max(3)`, model viết 4 đoạn là hỏng cả
 * lá thư dù ba đoạn đầu dùng được.
 *
 * `.min(n)` thì GIỮ - đó là sàn chất lượng cố ý, và cắt bừa không tạo ra nội
 * dung mà model đã không viết.
 *
 * Soi cấu trúc zod chứ không đọc chữ trong file: `.transform()` bọc mảng lại
 * thành `pipe`, nên regex trên mã nguồn sẽ báo sai cả hai chiều.
 */
type ZodNode = {
  _zod?: {
    def?: {
      type?: string;
      checks?: Array<{ _zod?: { def?: { check?: string } } }>;
      shape?: Record<string, unknown>;
      element?: unknown;
      innerType?: unknown;
      in?: unknown;
      out?: unknown;
      options?: unknown[];
      valueType?: unknown;
    };
  };
};

const findArrayMaxChecks = (root: unknown): string[] => {
  const found: string[] = [];
  const seen = new Set<unknown>();

  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);

    const def = (node as ZodNode)._zod?.def;
    if (!def) return;

    if (def.type === 'array') {
      const capped = (def.checks ?? []).some(
        (check) => check._zod?.def?.check === 'max_length',
      );
      if (capped) found.push(path || '(gốc)');
    }

    for (const [key, value] of Object.entries(def.shape ?? {})) {
      walk(value, path ? `${path}.${key}` : key);
    }
    for (const key of ['element', 'innerType', 'in', 'out', 'valueType']) {
      walk((def as Record<string, unknown>)[key], path);
    }
    for (const option of def.options ?? []) walk(option, path);
  };

  walk(root, '');
  return found;
};

/** Schema gửi cho MODEL. Trần số lượng ở đây phải cắt, không được từ chối. */
const MODEL_SCHEMAS: Array<[string, ZodType]> = [
  ['cvSchema', cvSchema],
  ['coverLetterSchema', coverLetterSchema],
  ['applicationEmailSchema', applicationEmailSchema],
  ['formAnswerSchema', formAnswerSchema],
  ['interviewPrepSchema', interviewPrepSchema],
  ['upskillGapsSchema', upskillGapsSchema],
  ['upskillPlanSchema', upskillPlanSchema],
  ['profileProposalSchema', profileProposalSchema],
  ['searchPlanSchema', searchPlanSchema],
  ['evaluationSchema', evaluationSchema],
  ['jobRequirementsSchema', jobRequirementsSchema],
  ['skillMergeSchema', skillMergeSchema],
  ['companyBriefSchema', companyBriefSchema],
];

describe('trần số lượng trên schema của model', () => {
  it.each(MODEL_SCHEMAS)('%s không dùng .max() trên mảng', (name, schema) => {
    expect({ schema: name, mangCoMax: findArrayMaxChecks(schema) }).toEqual({
      schema: name,
      mangCoMax: [],
    });
  });

  /**
   * Chiều ngược lại: schema nhận input NGƯỜI DÙNG phải GIỮ `.max()`.
   *
   * Ở đó `too_big` thành HTTP 400 để người dùng biết mà sửa; cắt lén là làm mất
   * chữ họ vừa gõ. Test này đỏ nếu ai đó "dọn nốt cho đồng bộ".
   */
  it('cvEditSchema GIỮ .max() vì nó nhận input người dùng', () => {
    expect(findArrayMaxChecks(cvEditSchema).length).toBeGreaterThan(0);
  });

  it('bắt được .max() nếu ai đó thêm lại', () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const bad = z.object({ items: z.array(z.string()).min(1).max(3) });
    expect(findArrayMaxChecks(bad)).toEqual(['items']);
  });
});
