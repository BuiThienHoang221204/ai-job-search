import { z, type ZodType } from 'zod';
import { formatIssue, truncateError, type SchemaIssue } from './failure-kind';

export function schemaInstruction<T>(
  system: string,
  schema: ZodType<T>,
): string | null {
  let json: unknown;
  try {
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

export function errorMessageOf(error: unknown, issues: SchemaIssue[]): string {
  return issues.length
    ? `${truncateError(error, 200)} | ${issues.map(formatIssue).join(' | ')}`
    : truncateError(error);
}
