import type { Logger } from '@nestjs/common';
import type { CallWarning } from 'ai';

/** Lõi khai `honorsResponseFormat: false` thì ta CỐ Ý chạy chế độ này — schema đi vào system prompt, xem `AiService.systemFor`. */
const handledByDesign = (warning: CallWarning): boolean =>
  (warning.type === 'unsupported' || warning.type === 'compatibility') &&
  warning.feature === 'responseFormat';

/** Mỗi nhánh của union mang tên trường khác nhau; đọc nhầm tên thì câu log ra đúng một chữ "unsupported". */
const describe = (warning: CallWarning): string => {
  switch (warning.type) {
    case 'unsupported':
    case 'compatibility':
      return [`${warning.type} "${warning.feature}"`, warning.details]
        .filter(Boolean)
        .join(': ');
    case 'deprecated':
      return `deprecated "${warning.setting}": ${warning.message}`;
    default:
      return warning.message;
  }
};

/** Đưa cảnh báo của AI SDK về nhật ký Nest — mặc định chúng đi ra `process.emitWarning`, nằm ngoài log của app. */
export function routeSdkWarnings(logger: Logger): void {
  globalThis.AI_SDK_LOG_WARNINGS = ({ warnings, provider, model }) => {
    const worth = warnings.filter((warning) => !handledByDesign(warning));
    if (!worth.length) return;

    logger.warn(
      `AI SDK (${provider ?? '?'}/${model ?? '?'}): ${worth.map(describe).join('; ')}`,
    );
  };
}
