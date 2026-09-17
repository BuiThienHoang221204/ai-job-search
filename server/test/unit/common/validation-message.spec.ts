import type { ValidationError } from '@nestjs/common';
import {
  toVietnameseMessages,
  translateConstraint,
  vietnameseValidationError,
} from 'src/common/validation-message.js';

const error = (
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children });

describe('translateConstraint', () => {
  test('dịch trần số và định dạng số theo kiểu Việt Nam', () => {
    expect(
      translateConstraint(
        'currentSalary',
        'currentSalary must not be greater than 2000000000',
      ),
    ).toBe('Lương hiện tại không được lớn hơn 2.000.000.000');
  });

  test('dịch trần độ dài chuỗi', () => {
    expect(
      translateConstraint(
        'summary',
        'summary must be shorter than or equal to 4000 characters',
      ),
    ).toBe('Giới thiệu bản thân không được dài quá 4.000 ký tự');
  });

  test('dịch ràng buộc kiểu dữ liệu', () => {
    expect(
      translateConstraint(
        'expectedSalary',
        'expectedSalary must be an integer number',
      ),
    ).toBe('Lương mong muốn phải là số nguyên');
    expect(translateConstraint('email', 'email must be an email')).toBe(
      'Email không đúng định dạng email',
    );
  });

  test('dịch lỗi của từng phần tử trong mảng', () => {
    expect(
      translateConstraint(
        'primarySkills',
        'each value in primarySkills must be a string',
      ),
    ).toBe('Mỗi mục trong Kỹ năng chính phải là chuỗi ký tự');
  });

  test('dịch lỗi trường lạ của forbidNonWhitelisted', () => {
    expect(
      translateConstraint('hackField', 'property hackField should not exist'),
    ).toBe('hackField không phải là trường hợp lệ');
  });

  test('trường chưa có nhãn thì giữ nguyên tên, không bịa', () => {
    expect(
      translateConstraint('someNewField', 'someNewField should not be empty'),
    ).toBe('someNewField không được để trống');
  });

  test('luật lạ thì giữ nguyên phần tiếng Anh thay vì nuốt mất thông tin', () => {
    expect(
      translateConstraint(
        'phone',
        'phone must match /^0\\d{9}$/ regular expression',
      ),
    ).toBe('Số điện thoại must match /^0\\d{9}$/ regular expression');
  });
});

describe('toVietnameseMessages', () => {
  test('gom nhiều lỗi của nhiều trường', () => {
    const messages = toVietnameseMessages([
      error('currentSalary', {
        max: 'currentSalary must not be greater than 2000000000',
      }),
      error('expectedSalary', {
        max: 'expectedSalary must not be greater than 2000000000',
      }),
    ]);
    expect(messages).toEqual([
      'Lương hiện tại không được lớn hơn 2.000.000.000',
      'Lương mong muốn không được lớn hơn 2.000.000.000',
    ]);
  });

  test('đi vào cả lỗi lồng bên trong', () => {
    const messages = toVietnameseMessages([
      error('filter', {}, [
        error('limit', { max: 'limit must not be greater than 100' }),
      ]),
    ]);
    expect(messages).toEqual(['Số dòng mỗi trang không được lớn hơn 100']);
  });
});

describe('vietnameseValidationError', () => {
  test('trả BadRequest mang danh sách thông báo đã dịch', () => {
    const exception = vietnameseValidationError([
      error('email', { isEmail: 'email must be an email' }),
    ]);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      message: ['Email không đúng định dạng email'],
    });
  });

  test('không có ràng buộc nào thì vẫn có một câu tiếng Việt', () => {
    const exception = vietnameseValidationError([]);
    expect(exception.getResponse()).toMatchObject({
      message: ['Dữ liệu gửi lên không hợp lệ'],
    });
  });
});
