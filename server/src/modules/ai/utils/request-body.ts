type BodyRewrite = { explicitStreamFlag: boolean; dropJsonMode: boolean };

/** Sửa thân request trước khi gửi: thêm `stream: false` khi lõi cần, bỏ JSON mode khi lõi tự kiểm JSON rồi từ chối cả câu trả lời. */
export function rewriteRequestBody(body: string, options: BodyRewrite): string {
  if (!options.explicitStreamFlag && !options.dropJsonMode) return body;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return body;
  }

  if (options.explicitStreamFlag && !('stream' in parsed))
    parsed.stream = false;
  const format = parsed.response_format as { type?: unknown } | undefined;
  if (options.dropJsonMode && format?.type === 'json_object') {
    delete parsed.response_format;
  }
  return JSON.stringify(parsed);
}
