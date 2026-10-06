import type { ReconcileResult } from '@/modules/reconcile/services/reconcile.service';

export function reconcileNote(result: ReconcileResult): string {
  const requeued = result.documents + result.matches;
  const failed =
    result.agentRuns +
    result.upskillReports +
    result.interviewPreps +
    result.profileDrafts +
    result.jobRequirements;

  const parts: string[] = [];
  if (requeued) {
    parts.push(
      `Đã xếp lại ${requeued} việc vào hàng đợi. Worker sẽ xử lý ở nền.`,
    );
  }
  if (failed) {
    parts.push(
      `Đã đánh hỏng ${failed} việc bị kẹt; người dùng bấm chạy lại được.`,
    );
  }
  if (result.deferred) {
    parts.push(`Còn ${result.deferred} việc vượt trần, để lượt sau.`);
  }
  return parts.join(' ') || 'Không tìm thấy việc nào bị rơi.';
}
