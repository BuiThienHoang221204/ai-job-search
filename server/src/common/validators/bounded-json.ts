import { registerDecorator, type ValidationOptions } from 'class-validator';

export type JsonBounds = {
  /// Kích thước tối đa sau khi JSON.stringify, tính bằng byte.
  maxBytes: number;
  /// Số phần tử tối đa nếu giá trị là mảng.
  maxItems: number;
  /// Độ sâu lồng nhau tối đa. Mặc định đủ cho dữ liệu hồ sơ thật.
  maxDepth?: number;
};

const DEFAULT_MAX_DEPTH = 6;

export type BoundsFailure =
  'not-json-container' | 'too-many-items' | 'too-deep' | 'too-large';

function depthOf(value: unknown, limit: number, current = 1): number {
  if (current > limit) return current;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (deepest, item) => Math.max(deepest, depthOf(item, limit, current + 1)),
      current,
    );
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).reduce<number>(
      (deepest, item) => Math.max(deepest, depthOf(item, limit, current + 1)),
      current,
    );
  }
  return current;
}

/// Kiểm một khối JSON tự do có nằm trong giới hạn hay không.
///
/// Tách khỏi decorator để test được như một hàm thuần: đây là chỗ duy nhất
/// quyết định cái gì lọt vào prompt, nên nó phải kiểm được mà không cần dựng cả
/// pipeline validation của Nest.
///
/// Trả về `null` khi hợp lệ, hoặc lý do đầu tiên khiến nó hỏng.
export function checkJsonBounds(
  value: unknown,
  bounds: JsonBounds,
): BoundsFailure | null {
  // Chỉ nhận mảng hoặc object. Một chuỗi hay một số lọt vào đây nghĩa là client
  // gửi sai hình dạng, và đoán ý người gửi ở tầng validation là sai chỗ.
  const isContainer =
    Array.isArray(value) || (typeof value === 'object' && value !== null);
  if (!isContainer) return 'not-json-container';

  if (Array.isArray(value) && value.length > bounds.maxItems) {
    return 'too-many-items';
  }

  // Kiểm ĐỘ SÂU trước kích thước: một cấu trúc lồng vài nghìn tầng vẫn có thể
  // rất nhỏ sau khi stringify, nhưng đủ để làm mọi bước duyệt cây phía sau tốn
  // kém bất thường.
  const maxDepth = bounds.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (depthOf(value, maxDepth) > maxDepth) return 'too-deep';

  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    // Cấu trúc vòng. Prisma cũng không ghi được, và JSON.stringify trong
    // PromptBuilder sẽ ném ngay giữa lúc dựng prompt.
    return 'not-json-container';
  }
  if (Buffer.byteLength(serialised, 'utf8') > bounds.maxBytes) {
    return 'too-large';
  }

  return null;
}

const MESSAGES: Record<BoundsFailure, string> = {
  'not-json-container': 'phải là một mảng hoặc một đối tượng JSON',
  'too-many-items': 'có quá nhiều phần tử',
  'too-deep': 'lồng nhau quá sâu',
  'too-large': 'vượt quá dung lượng cho phép',
};

/**
 * Chặn trên cho một trường JSON tự do.
 *
 * VÌ SAO CẦN: năm trường hồ sơ (`experiences`, `educations`, `certificates`,
 * `projects`, `behavioralTraits`) được lưu nguyên dạng rồi `JSON.stringify`
 * thẳng vào prompt gửi lên nhà cung cấp model. Trước đây chúng khai
 * `@IsOptional() unknown` — nghĩa là JSON tuỳ ý, kích thước tuỳ ý. Một người
 * dùng gửi vài megabyte vào đó là mỗi lần chấm điểm của họ kéo theo một prompt
 * khổng lồ: chậm, tốn tiền, và với gateway có hạn mức thì đủ để làm hỏng dịch
 * vụ cho những người khác.
 *
 * CỐ Ý không kiểm hình dạng bên trong. Hình dạng của các khối này chưa được
 * chốt ở đâu cả (giao diện cho nhập JSON thô), nên áp một schema ở đây sẽ khoá
 * chết dữ liệu người dùng đang có. Chặn trên về kích thước là phần đúng đắn có
 * thể làm ngay mà không phải quyết định trước một thiết kế chưa xong.
 */
export function IsBoundedJson(
  bounds: JsonBounds,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isBoundedJson',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => checkJsonBounds(value, bounds) === null,
        defaultMessage: (args) => {
          const failure = checkJsonBounds(args?.value, bounds);
          const reason = failure ? MESSAGES[failure] : 'không hợp lệ';
          return `${propertyName} ${reason}`;
        },
      },
    });
  };
}
