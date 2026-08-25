import type { ProviderDescriptor } from './types.js';

/**
 * Kilo — lõi ĐỨNG CUỐI chuỗi, không phải lõi chính.
 *
 * Đặc điểm khiến nó đáng có: đã đo, gateway này **nhận request mà không cần API
 * key** (cả không header lẫn `Bearer public` đều trả 200). Nên nó cứu được lúc
 * cả OpenCode lẫn OpenRouter cạn hạn mức, mà không tốn gì để dựng.
 *
 * Ba lý do nó KHÔNG được làm lõi chính:
 *
 * 1. **Không key nghĩa là không có hợp đồng.** Y hệt cái bẫy của chuỗi
 *    `"public"` bên OpenCode: bể dùng chung với người lạ, cạn không báo trước,
 *    và họ đóng cửa lúc nào cũng được mà không nợ ta lời nào.
 * 2. **Cả 14 model free đều tự khai `mayTrainOnYourPrompts: true`.** App gửi đi
 *    CV người thật, nên với pha thương mại hoá đây là chặn cứng.
 * 3. Bể model free của nó gần trùng khít OpenRouter — thêm nó KHÔNG mở rộng
 *    được tập model, chỉ mở thêm một đường vào.
 *
 * **Cố ý KHÔNG khai `declaresStructuredOutput`, dù `/models` của kilo CÓ trả
 * `supported_parameters`.** Lời khai đó đã đo là sai: `tencent/hy3:free` khai
 * `structured_outputs: false` nhưng vẫn trả JSON hợp lệ trên prompt thật, và nó
 * là model cho kết quả tiếng Việt sạch nhất trong tất cả những cái đã thử. Tin
 * lời khai ở đây là tự loại mất model tốt nhất.
 */
export const kilo: ProviderDescriptor = {
  id: 'kilo',
  label: 'Kilo',
  apiKeyEnv: 'KILO_API_KEY',

  knownNoStructuredOutput: [
    // Đo trên prompt thật: không khớp schema.
    'stepfun/step-3.7-flash:free',
    // Cùng model đã đo là hỏng bên OpenCode.
    'poolside/laguna-s-2.1:free',
  ],
};
