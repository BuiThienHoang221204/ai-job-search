/** Thông báo của một giá trị `catch` chưa biết kiểu. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
