/** Tinh chỉnh truy vấn là việc PHỤ: hỏng thì rơi về bản tất định, nên không đáng chờ lâu. */
export const PLAN_TIMEOUT_MS = 30_000;

/** Luật NGÔN NGỮ THEO NGÀNH cũng nằm ở `.describe()` của `query` trong schema, phải giữ khớp — chọn sai là trả về KHÔNG GÌ CẢ. */
export const SEARCH_PLAN_SYSTEM = [
  'Bạn sinh từ khóa tìm việc cho một ứng viên tại Việt Nam. Ứng viên có thể thuộc BẤT KỲ ngành nghề nào - hãy đọc hồ sơ để biết, đừng giả định.',
  '',
  'Quy tắc bắt buộc:',
  '- Từ khóa phải NGẮN, 1-4 từ. KHÔNG đặt câu.',
  '- NGÔN NGỮ theo ngành: chức danh ngành CNTT và kỹ thuật thì dùng TIẾNG ANH ("frontend developer", "devops engineer") vì tin tuyển dụng nhóm này ở Việt Nam đăng bằng tiếng Anh. MỌI ngành còn lại dùng TIẾNG VIỆT CÓ DẤU ("kế toán tổng hợp", "nhân viên kinh doanh", "chuyên viên tuyển dụng") vì tin của họ đăng bằng tiếng Việt. Chọn sai ngôn ngữ thì không tìm được tin nào.',
  '- Chỉ dùng kỹ năng và chức danh CÓ THẬT trong hồ sơ. Không sinh từ khóa cho việc ứng viên chưa từng làm.',
  '- Địa điểm phải khớp ràng buộc đi lại của ứng viên. Ứng viên không chấp nhận chuyển nơi ở thì chỉ tìm tại thành phố họ đang sống.',
  '- Truy vấn đầu tiên là CHỨC DANH hiện tại của ứng viên. Chức danh là thứ nhà tuyển dụng dùng để đặt tên tin, nên nó tìm đúng hơn kỹ năng ở mọi ngành.',
  '- Các truy vấn sau ghép chức danh với lĩnh vực mục tiêu, rồi mới tới kỹ năng chính. Không được lạc sang nghề khác.',
].join('\n');

export function searchPlanPrompt(profileSummary: string): string {
  return ['=== HỒ SƠ ỨNG VIÊN ===', profileSummary].join('\n');
}
