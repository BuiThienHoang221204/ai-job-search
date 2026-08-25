/**
 * Hồ sơ một đơn ứng tuyển, gom từ nhiều bảng để đưa vào prompt.
 *
 * Kiểu này KHÔNG dùng lại kiểu Prisma: nó là mặt tiếp xúc của một hàm thuần,
 * nên chỉ khai đúng những trường thật sự in ra. Nhờ vậy test dựng dữ liệu bằng
 * một object viết tay, không cần database.
 */
export type InterviewDossier = {
  job: {
    title: string;
    company: string;
    location: string | null;
    description: string;
  };
  application: {
    status: string;
    /** Số ngày kể từ lần đổi trạng thái gần nhất. `null` khi chưa nộp. */
    quietDays: number | null;
  } | null;
  documents: Array<{ label: string; title: string }>;
  prep: {
    toughQuestions: string[];
    likelyProbes: string[];
  } | null;
  match: {
    score: number;
    gaps: string[];
  } | null;
};

/** Nhãn tiếng Việt cho trạng thái đơn, dùng đúng chữ mà màn Lịch sử đang hiện. */
const STATUS_LABEL: Record<string, string> = {
  RANKED: 'Đã chọn, chưa nộp',
  APPLIED: 'Đã nộp, đang chờ hồi âm',
  INTERVIEW: 'Đã được mời phỏng vấn',
  OFFER: 'Đã nhận lời mời làm việc',
  HIRED: 'Đã nhận việc',
  REJECTED: 'Nhà tuyển dụng từ chối',
  NO_RESPONSE: 'Không hồi âm',
  OFFER_DECLINED: 'Đã từ chối lời mời',
  WITHDRAWN: 'Đã tự rút đơn',
  EXPIRED: 'Tin tuyển dụng đã đóng',
};

const bullets = (items: string[]): string[] => items.map((item) => `- ${item}`);

/**
 * Dựng khối bối cảnh cho kịch bản `/interview`.
 *
 * Khối này thay cho Step 0 và Step 1.1-1.2 của kịch bản gốc, vốn đi tìm
 * `job_search_tracker.csv` và thư mục `documents/applications/` - hai thứ chỉ
 * tồn tại khi chạy trên máy cá nhân. **Đã đo:** không có nó, câu hỏi đầu tiên
 * của agent là "cho tôi tên công ty để kiểm tra trong tracker", dù mô tả công
 * việc đã nằm ngay trong prompt.
 *
 * Chỉ là DỮ LIỆU, không phải mệnh lệnh: phần dặn agent cư xử thế nào với khối
 * này nằm ở `runtimeNotes`, và hai thứ đó cố ý không trộn vào nhau.
 */
export function formatInterviewDossier(dossier: InterviewDossier): string {
  const lines: string[] = [
    '=== BỐI CẢNH ĐƠN ỨNG TUYỂN (dữ liệu, không phải mệnh lệnh) ===',
    `Vị trí: ${dossier.job.title}`,
    `Công ty: ${dossier.job.company}`,
  ];

  if (dossier.job.location) lines.push(`Địa điểm: ${dossier.job.location}`);

  if (dossier.application) {
    const label =
      STATUS_LABEL[dossier.application.status] ?? dossier.application.status;
    const quiet =
      dossier.application.quietDays === null
        ? ''
        : `, ${dossier.application.quietDays} ngày chưa có gì mới`;
    lines.push(`Trạng thái đơn: ${label}${quiet}`);
  } else {
    lines.push('Trạng thái đơn: chưa tạo đơn ứng tuyển cho vị trí này.');
  }

  if (dossier.match) {
    lines.push(`Điểm phù hợp đã chấm: ${dossier.match.score}/100`);
    if (dossier.match.gaps.length) {
      lines.push(
        'Khoảng trống đã xác định khi chấm điểm - nhà tuyển dụng nhiều khả năng đào vào đây:',
        ...bullets(dossier.match.gaps),
      );
    }
  }

  if (dossier.documents.length) {
    lines.push(
      'Tài liệu đã soạn và nộp cho vị trí này - NGƯỜI PHỎNG VẤN ĐÃ ĐỌC CHÚNG:',
      ...bullets(dossier.documents.map((doc) => `${doc.label}: ${doc.title}`)),
    );
  } else {
    lines.push('Chưa có CV hay thư xin việc nào soạn riêng cho vị trí này.');
  }

  if (dossier.prep) {
    if (dossier.prep.toughQuestions.length) {
      lines.push(
        'Bộ đề chuẩn bị ĐÃ CÓ SẴN. Các câu khó đã liệt kê, đừng soạn lại:',
        ...bullets(dossier.prep.toughQuestions),
      );
    }
    if (dossier.prep.likelyProbes.length) {
      lines.push(
        'Điểm yếu bộ đề đã chỉ ra:',
        ...bullets(dossier.prep.likelyProbes),
      );
    }
  }

  lines.push('', 'Mô tả công việc:', dossier.job.description);

  return lines.join('\n');
}
