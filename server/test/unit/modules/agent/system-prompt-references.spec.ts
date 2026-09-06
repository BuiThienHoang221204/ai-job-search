import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentLimits,
  SkillReference,
} from 'src/modules/agent/agent.types.js';
import {
  PRELOADED_REFERENCES,
  REFERENCE_SECTIONS,
  buildSystemPrompt,
} from 'src/modules/agent/prompts/system-prompt.js';
import { PromptBuilderService } from 'src/modules/skills/services/prompt-builder.service.js';

const SKILL_DIR = join(
  __dirname,
  '../../../../../.claude/skills/job-application-assistant',
);

const limits = { maxSteps: 12 } as AgentLimits;

const references: SkillReference[] = [
  { file: '03-writing-style.md', body: 'Viết câu ngắn, không sáo rỗng.' },
];

describe('khung đặc tả nạp sẵn', () => {
  it('mọi file trong danh sách nạp sẵn đều tồn tại thật', () => {
    const missing = Object.values(PRELOADED_REFERENCES)
      .flat()
      .filter((file) => !existsSync(join(SKILL_DIR, file)));

    expect(missing).toEqual([]);
  });

  it('không nạp sẵn hồ sơ ứng viên vì read_profile đã lo', () => {
    expect(Object.values(PRELOADED_REFERENCES).flat()).not.toContain(
      '01-candidate-profile.md',
    );
  });

  it('đưa nội dung file vào prompt kèm lệnh cấm đọc lại', () => {
    const prompt = buildSystemPrompt(
      'Step 1: đọc tin',
      limits,
      'apply',
      references,
    );

    expect(prompt).toContain('Viết câu ngắn, không sáo rỗng.');
    expect(prompt).toContain('ĐỪNG gọi read_skill_reference');
    expect(prompt).toContain('03-writing-style.md');
  });

  it('không nạp gì thì prompt không có khối nạp sẵn', () => {
    const prompt = buildSystemPrompt('Step 1: đọc tin', limits, 'apply');

    expect(prompt).not.toContain('KHUNG ĐẶC TẢ ĐÃ NẠP SẴN');
  });

  it('khối khác biệt môi trường vẫn đứng SAU khung nạp sẵn', () => {
    const prompt = buildSystemPrompt(
      'Step 1: đọc tin',
      limits,
      'apply',
      references,
    );

    expect(prompt.indexOf('KHUNG ĐẶC TẢ ĐÃ NẠP SẴN')).toBeLessThan(
      prompt.indexOf('KHÁC BIỆT CỦA MÔI TRƯỜNG NÀY'),
    );
  });
});

describe('cắt phần LaTeX khỏi 05-cv-templates.md', () => {
  const body = readFileSync(join(SKILL_DIR, '05-cv-templates.md'), 'utf8');
  const kept = new PromptBuilderService().keepSections(
    body,
    REFERENCE_SECTIONS['05-cv-templates.md'],
  );

  it('giữ được phần hướng dẫn nội dung', () => {
    expect(kept).toContain('Section-by-Section Tailoring');
    expect(kept).toContain('ATS Parseability');
    expect(kept.length).toBeGreaterThan(2000);
  });

  it('bỏ hẳn ba mục dạy model dựng và compile LaTeX', () => {
    expect(kept).not.toContain('Template: LaTeX moderncv');
    expect(kept).not.toContain('Document Structure');
    expect(kept).not.toContain('Compile-and-Inspect Loop');
    expect(kept).not.toContain('Color overrides');
  });

  it('phần LaTeX còn sót lại chỉ là nhắc thoáng qua, không phải hướng dẫn', () => {
    const commands = kept.match(/\[a-z]+{/gi) ?? [];

    expect(commands.length).toBeLessThanOrEqual(3);
  });

  it('cắt đi hơn một phần ba số chữ', () => {
    expect(kept.length).toBeLessThan(body.length * 0.7);
  });
});
