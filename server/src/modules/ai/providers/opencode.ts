import { randomUUID } from 'node:crypto';
import type { ProviderDescriptor } from './types.js';

/**
 * OpenCode Zen — lõi mặc định, và là lõi MÙ về capability.
 *
 * `GET /zen/v1/models` trả đúng bốn trường cho mỗi model: `id`, `object`,
 * `created`, `owned_by`. Không có gì cho biết model làm được gì. Nên ở lõi này
 * chỉ phép đo mới biết, và danh sách dưới đây là kết quả đo thật chứ không suy
 * ra từ metadata — xem bảng model trong `CLAUDE.md`.
 *
 * `x-opencode-session` là ĐIỀU KIỆN THỨ HAI để tier free chạy, bên cạnh
 * `User-Agent: opencode`. Thiếu nó thì mọi request trả **400 `MissingSessionID`**
 * kèm câu "OpenCode's free tier can only be used in OpenCode" — một thông báo
 * dễ đọc nhầm thành "bể free đã đóng", và đã bị đọc nhầm đúng như vậy ngày
 * 2026-09-09, dẫn tới cả một vòng đổi sang nhà cung cấp khác không cần thiết.
 *
 * Đo được: giá trị KHÔNG cần đúng session thật nào — một chuỗi ngẫu nhiên cũng
 * được chấp nhận. Sinh một lần cho mỗi tiến trình là đủ.
 */
export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',

  extraHeaders: {
    'x-opencode-session': randomUUID(),
  },

  knownNoStructuredOutput: [
    // Trả content rỗng dù đã cho tới 1500 token.
    'laguna-s-2.1-free',
    // server_error.
    'ling-3.0-tiny-free',
  ],
};
