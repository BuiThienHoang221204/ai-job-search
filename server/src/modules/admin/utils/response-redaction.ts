/** Tác vụ có đầu ra là CV, hồ sơ hay lời phỏng vấn của người thật; xem chú thích `AiCall.responseText`. */
const PERSONAL_PREFIXES = ['document.', 'profile.', 'interview.', 'question.'];

export const isPersonalPurpose = (purpose: string): boolean =>
  PERSONAL_PREFIXES.some((prefix) => purpose.startsWith(prefix));

/** Lời gọi gắn với một người dùng thì che phản hồi thô: `match.evaluate` cũng tả lại kỹ năng và nơi làm cũ của họ. */
export function visibleResponse(
  call: { purpose: string; userId: string | null },
  responseText: string | null,
): { responseText: string | null; responseRedacted: boolean } {
  if (responseText && (call.userId || isPersonalPurpose(call.purpose))) {
    return { responseText: null, responseRedacted: true };
  }
  return { responseText, responseRedacted: false };
}
