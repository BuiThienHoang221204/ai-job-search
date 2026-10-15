import type { Identity } from 'src/modules/documents/content.types.js';
import { mergeIdentity } from 'src/modules/documents/utils/identity.js';

const fromProfile: Identity = {
  name: 'Bùi Thiên Hoàng',
  email: 'dangnhap@example.com',
  phone: '0935690811',
  location: 'Bình Thạnh, TP.HCM',
  title: 'Full Stack Developer',
};

/** Phần đầu CV sửa riêng cho một CV: không ghi ngược về hồ sơ, không đụng email đăng nhập. */
describe('mergeIdentity', () => {
  test('chưa sửa gì thì giữ nguyên tài khoản/hồ sơ', () => {
    expect(mergeIdentity(fromProfile, null)).toEqual(fromProfile);
    expect(mergeIdentity(fromProfile, {})).toEqual(fromProfile);
  });

  test('trường đã sửa đè lên, trường chưa sửa vẫn theo hồ sơ', () => {
    const merged = mergeIdentity(fromProfile, {
      email: 'lienhe@example.com',
      title: 'Backend Engineer',
    });

    expect(merged.email).toBe('lienhe@example.com');
    expect(merged.title).toBe('Backend Engineer');
    expect(merged.phone).toBe('0935690811');
  });

  // Xoá trắng một ô là muốn ẩn dòng đó trên CV này; tự điền lại từ hồ sơ là làm ngược ý người dùng.
  test('chuỗi rỗng là cố ý ẩn, không lùi về hồ sơ', () => {
    expect(mergeIdentity(fromProfile, { phone: '' }).phone).toBe('');
  });

  test('bỏ qua giá trị không phải chuỗi trong cột Json', () => {
    expect(mergeIdentity(fromProfile, { phone: 123, other: 'x' })).toEqual(
      fromProfile,
    );
  });
});
