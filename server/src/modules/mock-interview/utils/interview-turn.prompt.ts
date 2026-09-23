export const TURN_MARKER = { next: 'TIẾP', done: 'HẾT' } as const;

export const QUESTION_MARK = '@@HOI@@';

const TOOL_CALL_BLOCK = /<tool_call>[\s\S]*?<\/tool_call>/g;

const FOREIGN_SCRIPT =
  /[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF\u1100-\u11FF\uAC00-\uD7AF\u0600-\u06FF]+/g;

export function scrubText(input: string): string {
  return input
    .split(QUESTION_MARK)
    .join('\n\n')
    .replace(TOOL_CALL_BLOCK, '')
    .replace(FOREIGN_SCRIPT, '');
}

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

export interface TurnHead {
  done: boolean;
  rest: string;
}

export function splitTurnMarker(head: string): TurnHead {
  const cut = head.indexOf('\n');
  const first = bare(cut === -1 ? head : head.slice(0, cut));
  const rest = cut === -1 ? '' : head.slice(cut + 1);

  if (first === bare(TURN_MARKER.done)) return { done: true, rest };
  if (first === bare(TURN_MARKER.next)) return { done: false, rest };
  return { done: false, rest: head };
}

const bare = (value: string): string =>
  value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export interface TurnParts {
  feedback: string;
  question: string;
}

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

const HOLD = Math.max(QUESTION_MARK.length, '</tool_call>'.length) - 1;

export function createStreamScrubber(): {
  push: (piece: string) => string;
  flush: () => string;
} {
  let pending = '';

  return {
    push(piece) {
      pending += piece;

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
