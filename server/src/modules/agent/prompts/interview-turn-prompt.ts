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

/**
 * Vạch ngăn giữa NHẬN XÉT và CÂU HỎI, backend cắt bỏ trước khi lưu.
 *
 * Bản ghi buổi luyện có hai ô riêng: `feedback` đọc từ `step.text`, `question`
 * đọc từ tham số `ask_user`. Vòng lặp agent cũ tôn trọng ranh giới đó một cách
 * tự nhiên. Bản stream đầu tiên thì không, và cái giá rất cụ thể: 2.180 ký tự
 * văn xuôi rơi vào ô `question` mà giao diện vẽ bằng một thẻ `<p>` in đậm — HTML
 * nuốt sạch 37 dấu xuống dòng, `**` hiện thô, còn ô `feedback` thành ô chết.
 *
 * Chọn chuỗi này vì nó không bao giờ xuất hiện trong văn xuôi tiếng Việt. `---`
 * thì không dùng được: model viết Markdown, và `---` là đường kẻ ngang hợp lệ.
 */
export const QUESTION_MARK = '@@HOI@@';

/** Rác model hay bịa ra: nó tự viết cú pháp gọi tool dù không được cho tool nào. */
const TOOL_CALL_BLOCK = /<tool_call>[\s\S]*?<\/tool_call>/g;

/**
 * Chữ Hán, Nhật, Hàn, Ả Rập lọt vào giữa câu tiếng Việt.
 *
 * Không phải rủi ro giả định: CLAUDE.md đã ghi đây là kiểu hỏng đặc trưng của
 * các model free, và một lượt thật ngày 2026-08-23 trả về "Ví dụ:定义
 * `PaymentService`" — nghĩa là model nghĩ ra chữ "định nghĩa" rồi phát ra bằng
 * tiếng Hán. Prompt đã dặn thẳng "chỉ viết chữ Latin có dấu" và nó vẫn làm.
 *
 * XOÁ chứ không thay bằng gì: chỗ đó vốn đã hỏng, và không có cách nào đoán
 * đúng từ tiếng Việt mà model định viết. Bỏ đi thì câu trên thành "Ví dụ:
 * `PaymentService`" — đọc được. Giữ lại thì người dùng đọc phải chữ Hán giữa
 * một buổi phỏng vấn tiếng Việt.
 *
 * KHÔNG chặn Cyrillic hay Hy Lạp: `α`, `β`, `Δ` xuất hiện hợp lệ trong nội dung
 * kỹ thuật, và chúng chưa bao giờ là kiểu hỏng đã đo được.
 */
const FOREIGN_SCRIPT =
  /[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF\u1100-\u11FF\uAC00-\uD7AF\u0600-\u06FF]+/g;

/**
 * Dọn mọi thứ không được phép tới tay người đọc.
 *
 * Dùng chung cho luồng chữ đang chảy và cho bản lưu vào database. Hai đường mà
 * dọn khác nhau thì màn hình sạch còn bản ghi bẩn — tải lại trang là chữ Hán
 * hiện về, và không ai hiểu vì sao.
 */
export function scrubText(input: string): string {
  return input
    .split(QUESTION_MARK)
    .join('\n\n')
    .replace(TOOL_CALL_BLOCK, '')
    .replace(FOREIGN_SCRIPT, '');
}

/** Đếm ký tự ngoài bảng Latin, để ghi log chứ không để chặn. */
export const countForeign = (input: string): number =>
  (input.match(FOREIGN_SCRIPT) ?? []).join('').length;

const RULES = [
  'Bạn là người phỏng vấn trong một buổi luyện tập. Chỉ nói phần của người phỏng vấn.',
  '',
  'MỖI lượt trả lời viết theo đúng thứ tự sau:',
  `1. Dòng đầu tiên CHỈ chứa một từ: ${TURN_MARKER.next} nếu còn hỏi tiếp, ${TURN_MARKER.done} nếu đây là lời kết thúc buổi. Không thêm dấu câu, không giải thích.`,
  '2. Nhận xét ngắn cho câu trả lời vừa rồi: được ở chỗ nào, cần sắc lại chỗ nào, câu chuyện STAR nào hợp hơn. Hai tới bốn câu.',
  `3. Một dòng CHỈ chứa ${QUESTION_MARK}`,
  '4. Câu hỏi tiếp theo. ĐÚNG MỘT câu, một dấu hỏi, không "và", không đánh số, không in đậm.',
  '',
  'Quy tắc:',
  '- Lượt đầu tiên của buổi thì bỏ phần nhận xét, vào thẳng câu hỏi.',
  '- Bám vào hồ sơ và tin tuyển dụng đã đọc ở đầu hội thoại. Không bịa kinh nghiệm cho ứng viên.',
  '- Điểm yếu thì hướng dẫn cách bắc cầu (thừa nhận → kinh nghiệm gần → lộ trình học), không dạy khai man.',
  '- Nhận xét theo giọng tự nhiên của chính ứng viên, đừng ép về một hình mẫu chung.',
  '- Hết bộ câu hỏi hoặc ứng viên xin dừng thì viết lời tổng kết buổi và đánh dấu HẾT.',
  '- Chỉ viết chữ Latin có dấu tiếng Việt. Tuyệt đối không chèn chữ Hán, Hàn hay Ả Rập.',
  '- KHÔNG nhắc tới file, thư mục hay lệnh gạch chéo. Đây là một buổi nói chuyện.',
  '- KHÔNG viết <tool_call>, <function> hay bất kỳ cú pháp gọi công cụ nào. Bạn không có công cụ nào cả, chỉ viết chữ.',
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
  const first = bare(cut === -1 ? head : head.slice(0, cut));
  const rest = cut === -1 ? '' : head.slice(cut + 1);

  if (first === bare(TURN_MARKER.done)) return { done: true, rest };
  if (first === bare(TURN_MARKER.next)) return { done: false, rest };
  return { done: false, rest: head };
}

/**
 * Bỏ dấu và chuẩn hoá hoa/thường trước khi so.
 *
 * So khớp đúng-từng-ký-tự đã trượt, và đo được ngay: `hy3-free` viết đúng
 * "TIẾP", còn `nemotron-3.5-lightning-free` viết **"TIEP"** không dấu. Chữ
 * không dấu thì không khớp, tín hiệu kết thúc buổi không bao giờ nhận ra được,
 * và buổi luyện chạy mãi cho tới khi người dùng bỏ đi.
 *
 * Model bỏ dấu tiếng Việt là chuyện thường tới mức không đáng coi là lỗi của
 * model — chỗ so khớp phải chịu được điều đó.
 */
const bare = (value: string): string =>
  value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Nhận xét và câu hỏi, đã tách khỏi nhau. */
export interface TurnParts {
  /** Phần nhận xét cho câu trả lời trước. Rỗng ở lượt đầu buổi. */
  feedback: string;
  /** Câu hỏi tiếp theo, hoặc lời tổng kết khi buổi đã xong. */
  question: string;
}

/**
 * Tách nhận xét khỏi câu hỏi, và dọn rác model bịa ra.
 *
 * Model quên vạch ngăn thì dồn tất cả vào `question` — giống hệt hành vi trước
 * khi có vạch, tức là tệ đi chứ không vỡ. Chọn chiều này vì chiều kia (đoán chỗ
 * cắt) sẽ cắt nhầm giữa câu.
 */
export function splitTurnParts(body: string): TurnParts {
  const clean = body
    .replace(TOOL_CALL_BLOCK, '')
    .replace(FOREIGN_SCRIPT, '')
    .trim();
  const at = clean.indexOf(QUESTION_MARK);

  if (at === -1) return { feedback: '', question: clean };

  return {
    feedback: clean.slice(0, at).trim(),
    question: clean.slice(at + QUESTION_MARK.length).trim(),
  };
}

/** Dài nhất trong các chuỗi phải giấu, dùng để biết cần giữ lại bao nhiêu đuôi. */
const HOLD = Math.max(QUESTION_MARK.length, '</tool_call>'.length) - 1;

/**
 * Lọc chuỗi chữ đang chảy: giấu vạch ngăn và rác `<tool_call>` khỏi màn hình.
 *
 * Vấn đề của việc lọc GIỮA luồng là một chuỗi có thể bị cắt đôi giữa hai mẩu —
 * `@@H` ở mẩu này, `OI@@` ở mẩu sau — nên lọc từng mẩu rời sẽ để lọt. Cách làm:
 * luôn giữ lại `HOLD` ký tự cuối, đủ để mọi chuỗi cần giấu ghép lại được ở lượt
 * sau. Độ trễ thêm đúng bằng thời gian model sinh 11 ký tự.
 *
 * `<tool_call>` xử lý khác: thấy dấu mở thì giữ TẤT CẢ từ đó cho tới khi có dấu
 * đóng. Nó dài không đoán trước được, mà để lọt nửa cái ra màn hình thì người
 * dùng đọc phải một đoạn XML giữa buổi phỏng vấn - đã xảy ra thật.
 */
export function createStreamScrubber(): {
  push: (piece: string) => string;
  flush: () => string;
} {
  let pending = '';

  return {
    push(piece) {
      pending += piece;

      // Đang ở giữa một khối tool_call chưa đóng thì chưa phát gì cả.
      const open = pending.lastIndexOf('<tool_call');
      const closed = pending.lastIndexOf('</tool_call>');
      if (open !== -1 && open > closed) return '';

      const ready = scrubText(pending);
      if (ready.length <= HOLD) return '';

      const out = ready.slice(0, ready.length - HOLD);
      pending = ready.slice(ready.length - HOLD);
      return out;
    },
    flush() {
      const out = scrubText(pending);
      pending = '';
      return out;
    },
  };
}
