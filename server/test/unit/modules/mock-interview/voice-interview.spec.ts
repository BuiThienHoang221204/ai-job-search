import {
  voiceBonusUsed,
  voiceMinutesUsed,
} from 'src/modules/mock-interview/utils/voice-interview.js';

describe('voiceMinutesUsed', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000);

  test('buổi còn mở (bỏ dở, không gửi lượt nào) tính tới bây giờ, tối đa bằng số phút đã cấp', () => {
    const open = (startedMinutesAgo: number) => ({
      status: 'WAITING_USER',
      startedAt: minutesAgo(startedMinutesAgo),
      updatedAt: minutesAgo(startedMinutesAgo),
      input: { mode: 'voice', minutes: 20 },
    });

    expect(voiceMinutesUsed([open(5)], now)).toBe(5);
    expect(voiceMinutesUsed([open(45)], now)).toBe(20);
  });
});

describe('voiceBonusUsed', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  test('buổi dùng hết phần hạn mức ngày trước, chỉ phần vượt mới trừ vào thưởng', () => {
    const run = (usedMinutes: number) => ({
      status: 'DONE',
      startedAt: new Date(now.getTime() - usedMinutes * 60_000),
      updatedAt: now,
      input: { mode: 'voice', minutes: 20, bonus: 15 },
    });

    expect(voiceBonusUsed([run(4)], now)).toBe(0);
    expect(voiceBonusUsed([run(12)], now)).toBe(7);
    expect(voiceBonusUsed([run(30)], now)).toBe(15);
  });
});
