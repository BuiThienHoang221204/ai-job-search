const PERSONAL_PREFIXES = ['document.', 'profile.', 'interview.', 'question.'];

export const isPersonalPurpose = (purpose: string): boolean =>
  PERSONAL_PREFIXES.some((prefix) => purpose.startsWith(prefix));

export function visibleResponse(
  call: { purpose: string; userId: string | null },
  responseText: string | null,
): { responseText: string | null; responseRedacted: boolean } {
  if (responseText && (call.userId || isPersonalPurpose(call.purpose))) {
    return { responseText: null, responseRedacted: true };
  }
  return { responseText, responseRedacted: false };
}
