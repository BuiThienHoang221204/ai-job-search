import {
  STUDY_TIMES,
  reminderBody,
  reminderSlot,
} from 'src/modules/upskill/utils/study-reminder.js';

describe('reminderSlot', () => {
  test('lượt cron 20:45 giờ Việt Nam nhắc giờ học 21:00 của chính ngày đó', () => {
    expect(reminderSlot(new Date('2026-10-26T13:45:00Z'))).toEqual({
      studyTime: '21:00',
      day: 'MO',
    });
  });

  test('cộng 15 phút qua nửa đêm thì sang ngày hôm sau', () => {
    expect(reminderSlot(new Date('2026-10-25T16:45:00Z'))).toEqual({
      studyTime: '00:00',
      day: 'MO',
    });
  });
});

describe('STUDY_TIMES', () => {
  test('từ 06:00 tới 23:00, bước 30 phút', () => {
    expect(STUDY_TIMES[0]).toBe('06:00');
    expect(STUDY_TIMES[1]).toBe('06:30');
    expect(STUDY_TIMES.at(-1)).toBe('23:00');
    expect(STUDY_TIMES).toHaveLength(35);
  });
});

describe('reminderBody', () => {
  test('gộp mọi kỹ năng học hôm đó, kèm mốc kế tiếp của kỹ năng đầu', () => {
    expect(
      reminderBody('21:00', [
        { skillName: 'Microservices', steps: [true, false, false] },
        { skillName: 'Python', steps: [false, false, false] },
      ]),
    ).toBe(
      'Hôm nay 21:00 học Microservices, Python. Mốc tiếp theo: làm một dự án nhỏ có dùng Microservices.',
    );
  });
});
