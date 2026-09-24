import { z, type ZodType } from 'zod';
import {
  formatIssue,
  truncateError,
  type SchemaIssue,
} from './failure-kind.js';

/** Bơm JSON Schema vào cuối system prompt, cho lõi KHÔNG ép được bằng `response_format`. `null` = không dựng được schema, người gọi phải log. */
export function schemaInstruction<T>(
  system: string,
  schema: ZodType<T>,
): string | null {
  let json: unknown;
  try {
    // `io: 'input'` là BẮT BUỘC: schema có `.transform()` thì bản mặc định ném, và model sinh ra bản TRƯỚC transform.
    json = z.toJSONSchema(schema, { io: 'input' });
  } catch {
    return null;
  }

  return [
    system,
    '',
    '--- ĐỊNH DẠNG ĐẦU RA BẮT BUỘC ---',
    'Chỉ trả về MỘT đối tượng JSON hợp lệ. Không viết lời dẫn, không giải thích, không rào ```json.',
    'Tên trường phải khớp CHÍNH XÁC JSON Schema dưới đây. Tuyệt đối không đổi tên trường, không thêm trường, không lồng thêm tầng.',
    'Các tiêu đề mục trong khung đánh giá ở trên KHÔNG phải tên trường.',
    JSON.stringify(json),
  ].join('\n');
}

/** Lỗi lệch schema nối thêm chi tiết từng trường; lỗi khác chỉ cắt ngắn. */
export function errorMessageOf(error: unknown, issues: SchemaIssue[]): string {
  return issues.length
    ? `${truncateError(error, 200)} | ${issues.map(formatIssue).join(' | ')}`
    : truncateError(error);
}
