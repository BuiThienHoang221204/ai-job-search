/** Một dòng kết quả sau khi đã bóc khỏi phản hồi của Serper. */
export type SearchHit = { title: string; url: string; snippet: string };

/**
 * Bóc kết quả từ phản hồi của Serper (google.serper.dev).
 *
 * Tách khỏi phần gọi mạng vì đây mới là chỗ dễ vỡ âm thầm: Serper trả nhiều
 * khối cạnh nhau (`organic`, `knowledgeGraph`, `answerBox`, `peopleAlsoAsk`),
 * và đọc nhầm khối thì hàm luôn trả về mảng rỗng mà không có lỗi nào — người
 * gọi sẽ kết luận "không tìm thấy gì về công ty này" thay vì "tra cứu hỏng".
 *
 * Tên trường của Serper là `link` và `snippet`, KHÔNG phải `url` và `content`
 * như Tavily.
 */
export function parseSerper(body: unknown): SearchHit[] {
  if (typeof body !== 'object' || body === null) return [];

  const organic = (body as { organic?: unknown }).organic;
  if (!Array.isArray(organic)) return [];

  return organic
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      url: typeof item.link === 'string' ? item.link : '',
      snippet:
        typeof item.snippet === 'string' ? item.snippet.slice(0, 600) : '',
    }))
    .filter((hit) => hit.url !== '');
}
