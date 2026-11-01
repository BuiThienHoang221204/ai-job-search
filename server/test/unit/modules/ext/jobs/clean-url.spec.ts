import { cleanUrl } from 'src/modules/ext/jobs/clean-url';

describe('cleanUrl', () => {
  it('bỏ tham số tracking, giữ phần còn lại', () => {
    expect(
      cleanUrl(
        'https://topcv.vn/viec-lam/abc.html?ta_source=BoxFeatureJob&utm_medium=x',
      ),
    ).toBe('https://topcv.vn/viec-lam/abc.html');
    expect(
      cleanUrl('https://itviec.com/it-jobs/dev-123?click_source=nav'),
    ).toBe('https://itviec.com/it-jobs/dev-123');
  });

  it('hai lần bấm TopCV cùng tin (u_sr_id phiên khác nhau) cho cùng một khoá', () => {
    const a =
      'https://www.topcv.vn/viec-lam/x/2325079.html?ta_source=JobSearchList_LinkDetail&u_sr_id=E1t3_1793515559';
    const b =
      'https://www.topcv.vn/viec-lam/x/2325079.html?ta_source=JobSearchList_LinkDetail&u_sr_id=Zz99_1793517755';
    expect(cleanUrl(a)).toBe('https://www.topcv.vn/viec-lam/x/2325079.html');
    expect(cleanUrl(a)).toBe(cleanUrl(b));
  });

  it('giữ tham số thật (không phải tracking), ví dụ id tin', () => {
    expect(cleanUrl('https://x.com/job?id=123&utm_source=fb')).toBe(
      'https://x.com/job?id=123',
    );
  });

  it('bỏ fragment và dấu "/" cuối', () => {
    expect(cleanUrl('https://x.com/job/#phan-mo-ta')).toBe('https://x.com/job');
    expect(cleanUrl('https://x.com/job/')).toBe('https://x.com/job');
  });

  it('hai URL chỉ khác tracking param cho ra cùng một khoá', () => {
    expect(cleanUrl('https://x.com/j?ta_source=A')).toBe(
      cleanUrl('https://x.com/j?ta_source=B'),
    );
  });

  it('URL hỏng thì trả nguyên (đã trim)', () => {
    expect(cleanUrl('  không phải url  ')).toBe('không phải url');
  });
});
