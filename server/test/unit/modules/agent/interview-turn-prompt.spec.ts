import {
  countForeign,
  createStreamScrubber,
  QUESTION_MARK,
  splitTurnMarker,
  splitTurnParts,
  TURN_MARKER,
} from 'src/modules/agent/prompts/interview-turn-prompt.js';

/**
 * Dòng điều khiển là thứ thay cho tín hiệu `ask_user` của vòng lặp agent.
 *
 * Nó hỏng theo hai chiều, và cả hai đều im lặng: cắt hụt thì chữ "TIẾP" chạy ra
 * màn hình người dùng; cắt quá tay thì nuốt mất dòng đầu của câu hỏi. Không có
 * test thì chỉ phát hiện bằng mắt, mà nó nằm giữa một câu tiếng Việt dài.
 */
describe('splitTurnMarker', () => {
  it('cắt dòng "còn hỏi tiếp" và giữ nguyên phần còn lại', () => {
    const { done, rest } = splitTurnMarker(
      `${TURN_MARKER.next}\n**Nhận xét:** Câu trả lời tốt.\n\nCâu tiếp theo?`,
    );

    expect(done).toBe(false);
    expect(rest).toBe('**Nhận xét:** Câu trả lời tốt.\n\nCâu tiếp theo?');
  });

  it('nhận ra dòng kết thúc buổi', () => {
    const { done, rest } = splitTurnMarker(
      `${TURN_MARKER.done}\nCảm ơn bạn đã luyện tập. Chúc may mắn!`,
    );

    expect(done).toBe(true);
    expect(rest).toBe('Cảm ơn bạn đã luyện tập. Chúc may mắn!');
  });

  /**
   * Model quên dòng điều khiển là chuyện phải tính tới, không phải giả định xa
   * vời — cả `nemotron` lẫn `mimo` đều đã từng bỏ qua một dòng chỉ dẫn.
   *
   * Đoán "còn hỏi tiếp" là chiều sai ÍT thiệt hại nhất: buổi luyện chạy thừa một
   * lượt, người dùng bỏ qua được. Đoán "kết thúc" thì buổi đóng lại giữa chừng.
   */
  it('model quên dòng điều khiển thì giữ nguyên toàn bộ chữ', () => {
    const { done, rest } = splitTurnMarker(
      'Bạn kể thêm về lần tối ưu API đó được không?',
    );

    expect(done).toBe(false);
    expect(rest).toBe('Bạn kể thêm về lần tối ưu API đó được không?');
  });

  /// Model hay thêm dấu cách hoặc xuống dòng thừa quanh dòng điều khiển.
  it('bỏ qua khoảng trắng thừa quanh dòng điều khiển', () => {
    expect(splitTurnMarker(`  ${TURN_MARKER.done}  \nXong rồi.`)).toEqual({
      done: true,
      rest: 'Xong rồi.',
    });
  });

  /// Chỉ có mỗi dòng điều khiển, chưa có chữ nào theo sau.
  it('không vỡ khi chưa có nội dung sau dòng điều khiển', () => {
    expect(splitTurnMarker(TURN_MARKER.next)).toEqual({
      done: false,
      rest: '',
    });
  });

  /**
   * Chữ "TIẾP" nằm giữa câu KHÔNG phải dòng điều khiển.
   *
   * Chỉ dòng đầu tiên mới được xét, nếu không thì một câu hỏi mở đầu bằng
   * "Tiếp theo, bạn..." sẽ bị cắt cụt.
   */
  it('chỉ xét dòng đầu, không quét cả chuỗi', () => {
    const head = 'Tiếp theo là câu hỏi về Docker.\nBạn dùng Docker thế nào?';

    expect(splitTurnMarker(head)).toEqual({ done: false, rest: head });
  });
});

/**
 * Tách nhận xét khỏi câu hỏi, và dọn rác model bịa ra.
 *
 * Cả hai đều là lỗi ĐÃ THẤY trên màn hình thật ngày 2026-08-23: một lượt trả về
 * 2.180 ký tự dồn hết vào ô câu hỏi, kèm nguyên một khối `<tool_call>` mà model
 * tự viết ra dù nó không được cho công cụ nào.
 */
describe('splitTurnParts', () => {
  it('tách nhận xét khỏi câu hỏi', () => {
    const { feedback, question } = splitTurnParts(
      `**Nhận xét:** Câu trả lời tốt, có số liệu.\n\n${QUESTION_MARK}\nBạn xử lý xung đột trong nhóm thế nào?`,
    );

    expect(feedback).toBe('**Nhận xét:** Câu trả lời tốt, có số liệu.');
    expect(question).toBe('Bạn xử lý xung đột trong nhóm thế nào?');
  });

  it('dọn khối tool_call model tự bịa', () => {
    const { question } = splitTurnParts(
      `${QUESTION_MARK}\nBạn dùng Docker thế nào?\n<tool_call>\n<function=ask_user>\n<parameter=question>Hỏi thêm?</parameter>\n</function>\n</tool_call>`,
    );

    expect(question).toBe('Bạn dùng Docker thế nào?');
    expect(question).not.toContain('tool_call');
  });

  /// Lượt đầu buổi không có gì để nhận xét.
  it('nhận xét rỗng thì chỉ còn câu hỏi', () => {
    expect(splitTurnParts(`${QUESTION_MARK}\nGiới thiệu về bạn?`)).toEqual({
      feedback: '',
      question: 'Giới thiệu về bạn?',
    });
  });

  /// Quên vạch ngăn thì dồn hết vào câu hỏi - tệ đi, nhưng không mất chữ nào.
  it('model quên vạch ngăn thì không mất nội dung', () => {
    const raw = 'Nhận xét dài dòng. Rồi câu hỏi tiếp theo?';

    expect(splitTurnParts(raw)).toEqual({ feedback: '', question: raw });
  });
});

describe('createStreamScrubber', () => {
  /** Chạy cả luồng qua bộ lọc rồi ghép lại, giống hệt điều backend làm. */
  const run = (pieces: string[]): string => {
    const scrub = createStreamScrubber();
    return pieces.map((piece) => scrub.push(piece)).join('') + scrub.flush();
  };

  it('giấu vạch ngăn, đổi thành ngắt đoạn', () => {
    expect(run([`Nhận xét.${QUESTION_MARK}Câu hỏi?`])).toBe(
      'Nhận xét.\n\nCâu hỏi?',
    );
  });

  /**
   * Đây là ca mà lọc từng mẩu rời sẽ để LỌT.
   *
   * Model phát chữ theo mẩu tuỳ ý, nên vạch ngăn rất dễ bị cắt đôi. Không giữ
   * lại đuôi thì `@@H` đi ra màn hình trước khi `OI@@` kịp tới.
   */
  it('vạch ngăn bị cắt đôi giữa hai mẩu vẫn bị giấu', () => {
    const out = run(['Nhận xét.@@H', 'OI@@Câu hỏi?']);

    expect(out).toBe('Nhận xét.\n\nCâu hỏi?');
    expect(out).not.toContain('@@');
  });

  it('giấu cả khối tool_call trải trên nhiều mẩu', () => {
    const out = run([
      'Câu hỏi?\n<tool_',
      'call>\n<function=ask_user>\n<parameter=question>x</parameter>\n',
      '</function>\n</tool_call>',
    ]);

    expect(out.trim()).toBe('Câu hỏi?');
    expect(out).not.toContain('tool_call');
  });

  it('chữ thường không bị giữ lại mẩu nào', () => {
    expect(run(['Xin ', 'chào ', 'bạn nhé'])).toBe('Xin chào bạn nhé');
  });
});

/**
 * Model bỏ dấu tiếng Việt, và đó là chuyện thường chứ không phải lỗi hiếm.
 *
 * Đo ngày 2026-08-23 trên cùng một prompt: `hy3-free` viết "TIẾP" đúng dấu,
 * `nemotron-3.5-lightning-free` viết "TIEP". So khớp đúng-từng-ký-tự trượt cái
 * thứ hai, và khi trượt thì tín hiệu kết thúc buổi không bao giờ nhận ra được —
 * buổi luyện chạy mãi cho tới khi người dùng bỏ đi.
 */
describe('splitTurnMarker — model viết không dấu', () => {
  it.each([
    ['TIEP', false],
    ['tiếp', false],
    ['HET', true],
    ['hết', true],
    ['Hết', true],
  ])('nhận ra "%s"', (marker, done) => {
    expect(splitTurnMarker(`${marker}\nNội dung.`)).toEqual({
      done,
      rest: 'Nội dung.',
    });
  });

  /// Chữ khác thì vẫn là nội dung, không phải dòng điều khiển.
  it('không nhận nhầm một từ khác', () => {
    expect(splitTurnMarker('TIẾN\nNội dung.')).toEqual({
      done: false,
      rest: 'TIẾN\nNội dung.',
    });
  });
});

/**
 * Chữ Hán lọt vào giữa câu tiếng Việt — kiểu hỏng CLAUDE.md đã ghi cho các
 * model free, và đã thấy thật ngày 2026-08-23: "Ví dụ:定义 `PaymentService`".
 *
 * Phải dọn ở CẢ HAI đường. Dọn mỗi luồng chữ thì màn hình sạch nhưng bản ghi
 * bẩn, và tải lại trang là chữ Hán hiện về.
 */
describe('dọn chữ ngoài bảng Latin', () => {
  const RAW = 'Ví dụ:定义 `PaymentService` interface';

  it('xoá khỏi luồng chữ đang chảy', () => {
    const scrub = createStreamScrubber();
    const out = scrub.push(RAW) + scrub.flush();

    expect(out).toBe('Ví dụ: `PaymentService` interface');
  });

  it('xoá khỏi bản lưu vào database', () => {
    expect(splitTurnParts(`${QUESTION_MARK}\n${RAW}?`).question).toBe(
      'Ví dụ: `PaymentService` interface?',
    );
  });

  it('đếm được để ghi log, không dọn im lặng', () => {
    expect(countForeign(RAW)).toBe(2);
    expect(countForeign('Không có chữ lạ nào.')).toBe(0);
  });

  /// Tiếng Việt có dấu và ký hiệu kỹ thuật KHÔNG được đụng tới.
  it('giữ nguyên tiếng Việt và ký hiệu kỹ thuật', () => {
    const keep = 'Độ trễ giảm từ 3s xuống 300ms — α = 0.5, Δt < 1s. Ổn chứ?';

    expect(countForeign(keep)).toBe(0);
    const scrub = createStreamScrubber();
    expect(scrub.push(keep) + scrub.flush()).toBe(keep);
  });
});
