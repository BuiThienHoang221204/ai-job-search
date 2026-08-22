import {
  buildOpeningPrompt,
  buildSystemPrompt,
} from 'src/modules/agent/prompts/system-prompt.js';
import type { AgentLimits } from 'src/modules/agent/agent.types.js';

const limits = { maxSteps: 16 } as AgentLimits;

/**
 * Ghi chú runtime là chỗ ta ĐÈ LÊN kịch bản, nên nó phải theo đúng kịch bản.
 *
 * Trước đây chỉ có một khối dùng chung, viết cho `apply.md`. Nhồi nó vào
 * `/interview` là dặn agent về `cover.cls` và benchmark lương giữa một buổi
 * phỏng vấn thử — nhiễu vô ích trong đúng khối đáng ra phải là câu cuối cùng
 * model đọc trước khi hành động.
 */
describe('buildSystemPrompt', () => {
  it('giữ nguyên các ghi chú của apply cho kịch bản apply', () => {
    const prompt = buildSystemPrompt('KỊCH BẢN APPLY', limits, 'apply');

    expect(prompt).toContain('cover.cls');
    expect(prompt).toContain('spawn_reviewer');
    expect(prompt).toContain('benchmark lương');
  });

  it('không nhắc gì về template hay thư xin việc trong kịch bản interview', () => {
    const prompt = buildSystemPrompt('KỊCH BẢN INTERVIEW', limits, 'interview');

    expect(prompt).not.toContain('cover.cls');
    expect(prompt).not.toContain('benchmark lương');
  });

  /* Các lỗi đo được ở hai lượt chạy /interview đầu, mỗi lỗi một dòng ghi chú. */
  it('vá các lỗi đã đo: hỏi tracker, hỏi dồn, đòi dán CV, đọc lại hồ sơ', () => {
    const prompt = buildSystemPrompt('KỊCH BẢN INTERVIEW', limits, 'interview');

    expect(prompt).toContain('job_search_tracker.csv');
    expect(prompt).toContain('ĐÚNG MỘT câu');
    expect(prompt).toContain('ĐỪNG bảo người dùng dán nội dung vào');
    expect(prompt).toContain('ĐỪNG đọc `01-candidate-profile.md`');
  });

  /*
   * Lỗi tốn nhất và khó thấy nhất: model viết câu hỏi ra text, lượt chạy DONE,
   * người dùng không có ô nào để trả lời — mà nhìn vào thì tưởng thành công.
   */
  it('bắt mọi câu hỏi phỏng vấn phải đi qua ask_user', () => {
    const prompt = buildSystemPrompt('KỊCH BẢN INTERVIEW', limits, 'interview');

    expect(prompt).toContain('PHẢI đi qua tool `ask_user`');
    expect(prompt).toContain('Step 4 KHÔNG phải tuỳ chọn');
  });

  it('vẫn cấp ghi chú chung cho kịch bản chưa khai riêng', () => {
    const prompt = buildSystemPrompt('KỊCH BẢN LẠ', limits, 'khong-co-that');

    expect(prompt).toContain('Không có Bash');
    expect(prompt).toContain('read_profile');
  });

  it('đặt ghi chú runtime SAU thân kịch bản', () => {
    const prompt = buildSystemPrompt('THAN_KICH_BAN', limits, 'apply');

    expect(prompt.indexOf('THAN_KICH_BAN')).toBeLessThan(
      prompt.indexOf('KHÁC BIỆT CỦA MÔI TRƯỜNG NÀY'),
    );
  });
});

describe('buildOpeningPrompt', () => {
  it('đặt bối cảnh trước mô tả công việc dán tay', () => {
    const prompt = buildOpeningPrompt({
      context: 'KHOI_BOI_CANH',
      jobDescription: 'MO_TA_DAN_TAY',
    });

    expect(prompt.indexOf('KHOI_BOI_CANH')).toBeLessThan(
      prompt.indexOf('MO_TA_DAN_TAY'),
    );
  });

  /* Rỗng là kết quả bình thường của `AgentContextService.build`, không phải lỗi. */
  it('bỏ qua bối cảnh rỗng mà không để lại dòng trống', () => {
    const prompt = buildOpeningPrompt({
      context: '',
      jobUrl: 'https://a.test',
    });

    expect(prompt).not.toContain('\n\n\n');
  });
});
