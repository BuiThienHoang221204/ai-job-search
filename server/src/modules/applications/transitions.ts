import type { ApplicationStatus } from '../../generated/prisma/enums.js';

/// Ai yêu cầu đổi trạng thái.
///
/// 'user' là người dùng bấm nút. 'system' là mọi thứ tự động: worker, đồng bộ
/// hộp thư, nhập liệu hàng loạt. Phân biệt hai thứ này là bắt buộc chứ không
/// phải cho đẹp - xem USER_DECISION_ONLY bên dưới.
export type TransitionActor = 'user' | 'system';

/// Đơn đã khép lại, không còn chờ hồi âm.
export const FINAL_STATUSES = [
  'HIRED',
  'REJECTED',
  'NO_RESPONSE',
  'OFFER_DECLINED',
  'WITHDRAWN',
  'EXPIRED',
] as const satisfies readonly ApplicationStatus[];

/// Đơn còn đang chạy.
export const OPEN_STATUSES = [
  'RANKED',
  'APPLIED',
  'INTERVIEW',
  'OFFER',
] as const satisfies readonly ApplicationStatus[];

/// Hai trạng thái CHỈ người dùng mới được đặt.
///
/// Quy tắc này lấy nguyên từ .claude/commands/gmail-sync.md: "Never propose
/// `hired` or `offer_declined` from an email - accepting or declining is the
/// user's decision, not something to infer." Nhận việc hay từ chối là quyết
/// định ngoài đời; không một email, một worker hay một luật suy diễn nào được
/// phép thay người dùng đưa ra quyết định đó.
export const USER_DECISION_ONLY = [
  'HIRED',
  'OFFER_DECLINED',
] as const satisfies readonly ApplicationStatus[];

export const isFinal = (status: ApplicationStatus): boolean =>
  (FINAL_STATUSES as readonly ApplicationStatus[]).includes(status);

/// Nhóm hiển thị trên màn hình Lịch sử ứng tuyển.
///
/// Cách gộp lấy từ .claude/commands/html-report.md: rejected / no_response /
/// offer_declined / withdrawn / expired đều về một nhóm "đã đóng". Người dùng
/// không cần 6 tab để xem những đơn đã hết chuyện.
export type StatusGroup = 'open' | 'interview' | 'offer' | 'closed';

export const groupOf = (status: ApplicationStatus): StatusGroup => {
  if (status === 'INTERVIEW') return 'interview';
  if (status === 'OFFER') return 'offer';
  return isFinal(status) ? 'closed' : 'open';
};

export type TransitionRequest = {
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: TransitionActor;
  /// Đơn đã từng ở OFFER hay chưa, suy từ nhật ký sự kiện. Không thể chỉ nhìn
  /// `from`: một đơn có thể đi OFFER -> INTERVIEW (thêm vòng) rồi mới HIRED.
  hadOffer: boolean;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/// Kiểm tra một lần đổi trạng thái có hợp lệ không.
///
/// Cố ý KHÔNG dựng máy trạng thái đầy đủ với danh sách cạnh cho phép. Bản CLI
/// của framework (/outcome) cho sửa trạng thái khá tự do vì đời thật lộn xộn:
/// nhà tuyển dụng gọi lại sau khi đã từ chối, ứng viên rút rồi quay lại. Siết
/// hơn framework là tự đặt ra chính sách mà framework không có. Chỉ chặn đúng
/// ba thứ thật sự sai.
export function checkTransition(request: TransitionRequest): TransitionResult {
  const { from, to, actor, hadOffer } = request;

  if (from === to) {
    return { ok: false, reason: `Đơn đã ở trạng thái ${to}` };
  }

  // 1. Máy móc không được quyết thay người.
  if (
    (USER_DECISION_ONLY as readonly ApplicationStatus[]).includes(to) &&
    actor !== 'user'
  ) {
    return {
      ok: false,
      reason: `Chỉ người dùng mới đặt được trạng thái ${to}. Nhận việc hay từ chối offer là quyết định ngoài đời, hệ thống không được tự suy ra.`,
    };
  }

  // 2. Không thể nhận hay từ chối một lời mời chưa từng có.
  if ((to === 'HIRED' || to === 'OFFER_DECLINED') && !hadOffer) {
    return {
      ok: false,
      reason: `Không thể chuyển sang ${to} khi đơn chưa từng ở trạng thái OFFER`,
    };
  }

  // 3. Mở lại đơn đã đóng là việc của người dùng, không phải của worker.
  if (isFinal(from) && actor !== 'user') {
    return {
      ok: false,
      reason: `Đơn đã đóng ở trạng thái ${from}; chỉ người dùng mới mở lại được`,
    };
  }

  return { ok: true };
}

/// Mốc thời gian cần ghi kèm khi chuyển sang trạng thái mới.
///
/// appliedAt chỉ đặt MỘT lần, ở lần chuyển sang APPLIED đầu tiên. Nếu đơn quay
/// lại APPLIED sau một vòng nào đó thì ngày nộp gốc vẫn phải giữ nguyên - đó là
/// mốc mà "im lặng bao nhiêu ngày" đếm từ đó.
export function timestampsFor(
  to: ApplicationStatus,
  current: { appliedAt: Date | null; closedAt: Date | null },
  now: Date,
): { appliedAt: Date | null; closedAt: Date | null } {
  return {
    appliedAt:
      to === 'APPLIED' && !current.appliedAt
        ? now
        : (current.appliedAt ?? null),
    // Quay lại trạng thái mở thì xóa ngày đóng: đơn đang chạy tiếp.
    closedAt: isFinal(to) ? now : null,
  };
}
