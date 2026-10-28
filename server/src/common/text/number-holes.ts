const NUMBER = /(?<![\p{L}\d.,])\d+(?:[.,]\d+)*/gu;

export const NUMBER_HOLE = '[__]';

/** Thay số không có trong `known` bằng ô trống `[__]` để model không tự đặt số liệu cho người dùng. */
export function holeUnknownNumbers(text: string, known: string): string {
  const knownNumbers = new Set(known.match(NUMBER) ?? []);
  return text.replace(NUMBER, (number) =>
    knownNumbers.has(number) ? number : NUMBER_HOLE,
  );
}
