import {
  followedAlertText,
  jobAlertBody,
  vnDayStart,
} from 'src/modules/jobs/utils/job-alert.js';

describe('vnDayStart', () => {
  test('lấy 00:00 giờ Việt Nam, kể cả khi giờ UTC còn ở ngày hôm trước', () => {
    expect(vnDayStart(new Date('2026-10-24T18:30:00Z'))).toEqual(
      new Date('2026-10-24T17:00:00Z'),
    );
  });
});

describe('jobAlertBody', () => {
  const jobs = [
    { title: 'Backend Developer', company: 'Nexa' },
    { title: 'Full-Stack Developer', company: 'OTS' },
  ];

  test('nêu tên hai tin đầu và đếm phần còn lại', () => {
    expect(jobAlertBody(12, jobs)).toBe(
      '12 tin mới hợp với bạn: Backend Developer · Nexa, Full-Stack Developer · OTS và 10 tin khác.',
    );
  });

  test('chỉ có một tin thì không nói "và 0 tin khác"', () => {
    expect(jobAlertBody(1, jobs.slice(0, 1))).toBe(
      '1 tin mới hợp với bạn: Backend Developer · Nexa.',
    );
  });
});

describe('followedAlertText', () => {
  test('nêu hai công ty nhiều tin nhất, đếm số công ty còn lại', () => {
    expect(
      followedAlertText([
        { name: 'Nexa', count: 3 },
        { name: 'OTS', count: 1 },
        { name: 'FPT', count: 1 },
      ]),
    ).toBe('Công ty bạn theo dõi: 5 tin mới từ Nexa, OTS và 1 công ty khác.');
  });
});
