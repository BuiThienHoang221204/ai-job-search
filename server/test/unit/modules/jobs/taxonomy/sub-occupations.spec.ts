import {
  resolveOccupation,
  resolveSubOccupation,
} from 'src/modules/jobs/taxonomy/resolve.js';
import {
  SUB_OCCUPATIONS,
  SUB_OCCUPATION_PARENT,
} from 'src/modules/jobs/taxonomy/sub-occupations.js';
import { OCCUPATIONS } from 'src/modules/jobs/taxonomy/occupations.js';

const sub = (title: string, tags: string[] = []) =>
  resolveSubOccupation(resolveOccupation(title, tags), title, tags);

describe('resolveSubOccupation', () => {
  test('tách được nghề bên trong nhóm CNTT', () => {
    expect(sub('Backend Engineer (Node.js)')).toBe('IT_BACKEND');
    expect(sub('Frontend Engineer (React)')).toBe('IT_FRONTEND');
    expect(sub('Fullstack Developer')).toBe('IT_FULLSTACK');
    expect(sub('Lập trình viên')).toBe('IT_SWE');
    expect(sub('QA Tester')).toBe('IT_QA');
    expect(sub('DevOps Engineer')).toBe('IT_DEVOPS');
    expect(sub('Chuyên viên An toàn thông tin')).toBe('IT_SECURITY');
  });

  test('tách được nghề ngoài ngành IT', () => {
    expect(sub('Điều dưỡng viên')).toBe('MED_NURSE');
    expect(sub('Kế toán tổng hợp')).toBe('FIN_ACCOUNTING');
    expect(sub('Nhân viên xuất nhập khẩu')).toBe('LOG_IMPEXP');
    expect(sub('Giáo viên tiếng Anh')).toBe('EDU_TEACHER');
  });

  test('không suy được thì trả null, KHÔNG đoán bừa', () => {
    expect(sub('Nhân viên')).toBeNull();
  });

  test('nhóm chưa tách tầng hai thì luôn null', () => {
    expect(resolveSubOccupation('OTHER', 'Việc gì đó', [])).toBeNull();
  });

  test('chỉ dò trong nhóm của chính nó', () => {
    expect(resolveSubOccupation('FINANCE', 'DevOps Engineer', [])).not.toBe(
      'IT_DEVOPS',
    );
  });

  test('lùi về tags khi chức danh không nói gì', () => {
    expect(sub('Chuyên viên', ['telesales'])).toBe('SALES_TELE');
  });
});

describe('tính toàn vẹn của danh mục', () => {
  test('mọi nhóm con đều trỏ về một nhóm cha có thật', () => {
    const parents = new Set(OCCUPATIONS.map((row) => row.code));
    for (const code of Object.keys(SUB_OCCUPATIONS)) {
      expect(parents.has(code)).toBe(true);
    }
  });

  test('mã nghề không trùng nhau giữa các nhóm', () => {
    const codes = Object.values(SUB_OCCUPATIONS).flatMap((subs) =>
      subs.map((row) => row.code),
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('bảng tra ngược phủ hết mọi nghề', () => {
    const codes = Object.values(SUB_OCCUPATIONS).flatMap((subs) =>
      subs.map((row) => row.code),
    );
    expect(Object.keys(SUB_OCCUPATION_PARENT).sort()).toEqual(codes.sort());
  });

  test('từ khoá đã ở dạng thường và không dấu', () => {
    for (const subs of Object.values(SUB_OCCUPATIONS)) {
      for (const row of subs) {
        for (const word of row.keywords) {
          expect(word).toBe(word.toLowerCase());
          expect(word.normalize('NFD')).toBe(word);
        }
      }
    }
  });
});
