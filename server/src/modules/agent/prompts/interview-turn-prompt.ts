/**
 * Prompt cho MỘT lượt đối đáp trong buổi luyện phỏng vấn.
 *
 * Vì sao không dùng lại `buildSystemPrompt`: từ lúc buổi luyện bắt đầu, agent
 * không gọi tool nào nữa. Đo trên một buổi thật ngày 2026-08-23 — 18 bước, chỉ
 * 5 bước đầu có tool, 11 bước cuối chỉ là `ask_user`. Nhưng mỗi lượt vẫn è cổ
 * mang theo cả kịch bản `interview.md` (2.763 token), guardrails về ghi file,
 * và 9 khai báo tool. Trung bình 19.828 token vào để sinh 822 token ra.
 *
 * Ở đây chỉ còn ba thứ một người phỏng vấn cần: vai của mình, cách nhận xét, và
 * hội thoại từ đầu buổi. Phần đọc hồ sơ và tra công ty đã xong ở giai đoạn mở
 * buổi và nằm sẵn trong hội thoại — không phải làm lại.
 */

/**
 * Dòng điều khiển ở ĐẦU câu trả lời, backend cắt bỏ trước khi gửi đi.
 *
 * Cần một tín hiệu "buổi luyện xong chưa" mà vòng lặp agent trước đây lấy từ
 * việc model có gọi `ask_user` hay không. Không còn tool thì phải có cách khác.
 *
 * Đặt ở dòng ĐẦU chứ không phải cuối, và đó là điểm mấu chốt: biết ngay trước
 * khi chữ đầu tiên chạy ra màn hình, nên người dùng không bao giờ thấy nó nhấp
 * nháy. Đặt ở cuối thì chỉ biết khi đã stream xong, và tín hiệu lọt ra màn.
 */
export const TURN_MARKER = { next: 'TIẾP', done: 'HẾT' } as const;

const RULES = [
  'Bạn là người phỏng vấn trong một buổi luyện tập. Chỉ nói phần của người phỏng vấn.',
  '',
  'MỖI lượt trả lời viết theo đúng thứ tự sau:',
  `1. Dòng đầu tiên CHỈ chứa một từ: ${TURN_MARKER.next} nếu còn hỏi tiếp, ${TURN_MARKER.done} nếu đây là lời kết thúc buổi. Không thêm dấu câu, không giải thích.`,
  '2. Nhận xét ngắn cho câu trả lời vừa rồi: được ở chỗ nào, cần sắc lại chỗ nào, câu chuyện STAR nào hợp hơn. Hai tới bốn câu.',
  '3. Câu hỏi tiếp theo. ĐÚNG MỘT câu hỏi, một dấu hỏi, không "và", không đánh số.',
  '',
  'Quy tắc:',
  '- Lượt đầu tiên của buổi thì bỏ phần nhận xét, vào thẳng câu hỏi.',
  '- Bám vào hồ sơ và tin tuyển dụng đã đọc ở đầu hội thoại. Không bịa kinh nghiệm cho ứng viên.',
  '- Điểm yếu thì hướng dẫn cách bắc cầu (thừa nhận → kinh nghiệm gần → lộ trình học), không dạy khai man.',
  '- Nhận xét theo giọng tự nhiên của chính ứng viên, đừng ép về một hình mẫu chung.',
  '- Hết bộ câu hỏi hoặc ứng viên xin dừng thì viết lời tổng kết buổi và đánh dấu HẾT.',
  '- Chỉ viết chữ Latin có dấu tiếng Việt. Tuyệt đối không chèn chữ Hán, Hàn hay Ả Rập.',
  '- KHÔNG nhắc tới file, thư mục hay lệnh gạch chéo. Đây là một buổi nói chuyện.',
].join('\n');

export const interviewTurnSystem = (): string => RULES;

/** Kết quả bóc dòng điều khiển ra khỏi đầu câu trả lời. */
export interface TurnHead {
  done: boolean;
  /** Phần chữ còn lại sau khi cắt dòng điều khiển. */
  rest: string;
}

/**
 * Cắt dòng điều khiển khỏi đầu chuỗi.
 *
 * Model quên mất dòng đó là chuyện phải tính tới: khi ấy coi như còn hỏi tiếp
 * và giữ nguyên toàn bộ chữ. Đoán sai theo chiều này chỉ khiến buổi luyện chạy
 * thêm một lượt; đoán sai theo chiều kia thì nuốt mất dòng đầu của câu hỏi.
 */
export function splitTurnMarker(head: string): TurnHead {
  const cut = head.indexOf('\n');
  const first = (cut === -1 ? head : head.slice(0, cut)).trim();

  if (first === TURN_MARKER.done) {
    return { done: true, rest: cut === -1 ? '' : head.slice(cut + 1) };
  }
  if (first === TURN_MARKER.next) {
    return { done: false, rest: cut === -1 ? '' : head.slice(cut + 1) };
  }
  return { done: false, rest: head };
}
