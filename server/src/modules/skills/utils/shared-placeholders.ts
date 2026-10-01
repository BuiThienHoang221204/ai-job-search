/** Câu dùng khi hồ sơ không có dữ liệu; `render` và `renderShared` phải in ĐÚNG cùng một chuỗi. */
export const NOT_PROVIDED = '(hồ sơ chưa cung cấp thông tin này)';

/** Token `[YOUR_*]` → NHÃN DÒNG mà `profileSummary` in ra; đổi nhãn bên đó thì phải đổi ở đây, có test ghim. */
export const PROFILE_LABELS: Record<string, string> = {
  YOUR_PRIMARY_SKILLS: 'Kỹ năng chính',
  YOUR_SECONDARY_SKILLS: 'Kỹ năng phụ',
  SKILLS_YOU_LACK: 'Kỹ năng còn thiếu',
  ROLES_WITH_LIMITED_EXPERIENCE: 'Kỹ năng còn thiếu',
  YOUR_DIRECT_EXPERIENCE_DOMAINS: 'Lĩnh vực có kinh nghiệm trực tiếp',
  YOUR_ADJACENT_EXPERIENCE: 'Kinh nghiệm liên quan',
  YOUR_CAREER_GOAL_1: 'Mục tiêu nghề nghiệp',
  YOUR_CAREER_GOAL_2: 'Mục tiêu nghề nghiệp',
  YOUR_CAREER_GOAL_3: 'Mục tiêu nghề nghiệp',
  YOUR_GROWTH_PRIORITIES: 'Mục tiêu nghề nghiệp',
  YOUR_ENERGIZING_TASKS: 'Công việc tạo hứng thú',
  YOUR_DRAINING_TASKS: 'Công việc gây chán nản',
  YOUR_COMMUTE_CONSTRAINTS: 'Ràng buộc đi lại',
  YOUR_SCHEDULE_CONSTRAINTS: 'Ràng buộc đi lại',
  YOUR_CITY: 'Địa điểm',
  YOUR_COUNTRY: 'Quốc gia',
  YOUR_LANGUAGES: 'Ngôn ngữ',
  YOUR_EMPLOYMENT_STATUS: 'Tình trạng',
  YOUR_LINKEDIN_HEADLINE: 'Chức danh',
};

/** Câu trỏ CỐ ĐỊNH thay cho dữ liệu: giống hệt với mọi hồ sơ nên nhà cung cấp cache được cả khung. Giữ NGẮN — nó lặp lại ở mọi token. */
export function pointerTo(label: string): string {
  return `(xem «${label}»)`;
}

/** Nói MỘT lần ở đầu khung thay vì lặp trong từng câu trỏ; thiếu vế "chưa cung cấp" thì dòng vắng mặt thành im lặng với model. */
export const POINTER_NOTE = `Ghi chú: «…» trỏ tới dòng cùng nhãn trong HỒ SƠ ỨNG VIÊN ở phần yêu cầu; hồ sơ không có dòng đó nghĩa là ${NOT_PROVIDED}.`;

/** Thay mọi `[YOUR_*]` bằng câu trỏ, KHÔNG đọc hồ sơ; token không có nhãn (tên, tài chính) luôn là NOT_PROVIDED như bản `render`. */
export function renderShared(template: string): string {
  let pointed = false;
  const rendered = template.replace(
    /\[([A-Z][A-Z0-9_]{2,})\]/g,
    (_match, token: string) => {
      const label = PROFILE_LABELS[token];
      if (!label) return NOT_PROVIDED;
      pointed = true;
      return pointerTo(label);
    },
  );
  return pointed ? `${POINTER_NOTE}\n\n${rendered}` : rendered;
}
