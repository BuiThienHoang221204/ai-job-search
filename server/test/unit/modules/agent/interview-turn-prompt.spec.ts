import {
  splitTurnMarker,
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
