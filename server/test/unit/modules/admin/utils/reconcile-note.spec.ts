import { reconcileNote } from 'src/modules/admin/utils/reconcile-note.js';
import type { ReconcileResult } from 'src/modules/reconcile/services/reconcile.service.js';

const result = (patch: Partial<ReconcileResult> = {}): ReconcileResult => ({
  documents: 0,
  matches: 0,
  agentRuns: 0,
  upskillReports: 0,
  interviewPreps: 0,
  profileDrafts: 0,
  jobRequirements: 0,
  deferred: 0,
  ...patch,
});

describe('reconcileNote', () => {
  test('không có gì thì báo không có việc rơi', () => {
    expect(reconcileNote(result())).toBe('Không tìm thấy việc nào bị rơi.');
  });

  /// Hỏng thật trước khi sửa: chỉ năm bảng bị đánh hỏng có việc kẹt mà admin vẫn nhận "Không tìm thấy việc nào bị rơi".
  test('chỉ có việc bị ĐÁNH HỎNG thì vẫn phải báo', () => {
    const note = reconcileNote(
      result({ profileDrafts: 2, jobRequirements: 1 }),
    );
    expect(note).toContain('Đã đánh hỏng 3 việc');
    expect(note).not.toContain('Không tìm thấy');
  });

  test('gộp đủ việc xếp lại, đánh hỏng và vượt trần', () => {
    expect(
      reconcileNote(
        result({ documents: 1, matches: 2, upskillReports: 1, deferred: 4 }),
      ),
    ).toBe(
      'Đã xếp lại 3 việc vào hàng đợi. Worker sẽ xử lý ở nền. Đã đánh hỏng 1 việc bị kẹt; người dùng bấm chạy lại được. Còn 4 việc vượt trần, để lượt sau.',
    );
  });
});
