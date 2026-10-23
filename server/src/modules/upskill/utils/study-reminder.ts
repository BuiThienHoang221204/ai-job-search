export const REMIND_BEFORE_MINUTES = 15;

const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const VN_OFFSET_MS = 7 * 60 * 60_000;
const WEEK_DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const pad = (value: number) => String(value).padStart(2, '0');

export const STUDY_TIMES: string[] = Array.from(
  { length: (LAST_HOUR - FIRST_HOUR) * 2 + 1 },
  (_, index) =>
    `${pad(FIRST_HOUR + Math.floor(index / 2))}:${index % 2 ? '30' : '00'}`,
);

/** Giờ học được nhắc ở lượt cron lúc `now`: bằng `now` cộng 15 phút theo giờ Việt Nam, kèm mã thứ của ngày đó. */
export function reminderSlot(now: Date): { studyTime: string; day: string } {
  const vn = new Date(
    now.getTime() + REMIND_BEFORE_MINUTES * 60_000 + VN_OFFSET_MS,
  );
  return {
    studyTime: `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`,
    day: WEEK_DAY_CODES[vn.getUTCDay()],
  };
}

const STEP_LABELS = [
  (skill: string) => `học nền tảng ${skill}`,
  (skill: string) => `làm một dự án nhỏ có dùng ${skill}`,
  (skill: string) => `thêm ${skill} vào hồ sơ và CV`,
];

/** Một thông báo gộp mọi kỹ năng học hôm đó, kèm mốc kế tiếp của kỹ năng đầu tiên. */
export function reminderBody(
  studyTime: string,
  items: { skillName: string; steps: boolean[] }[],
): string {
  const names = items.map((item) => item.skillName).join(', ');
  const first = items[0];
  const nextStep = first ? first.steps.findIndex((done) => !done) : -1;
  if (!first || nextStep < 0) return `Hôm nay ${studyTime} học ${names}.`;
  return `Hôm nay ${studyTime} học ${names}. Mốc tiếp theo: ${STEP_LABELS[nextStep](first.skillName)}.`;
}
