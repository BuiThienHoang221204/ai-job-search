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
