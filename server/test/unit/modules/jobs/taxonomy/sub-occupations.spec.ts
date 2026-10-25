import {
  resolveOccupation,
  resolveSubOccupation,
} from 'src/modules/jobs/taxonomy/resolve.js';
import {
  SUB_OCCUPATIONS,
  SUB_OCCUPATION_PARENT,
  nearbySubOccupations,
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

  test('tin IT từng lọt vào "chưa rõ nghề" của mọi hồ sơ IT nay xếp đúng nghề (đo 2026-10-25)', () => {
    expect(sub('Chuyên viên Sản Phẩm (PHÂN TÍCH NGHIỆP VỤ & THIẾT KẾ)')).toBe(
      'IT_PM',
    );
    expect(sub('Software Development Engineer in Test (SDET)')).toBe('IT_QA');
    expect(sub('IT Service Desk')).toBe('IT_SUPPORT');
    expect(sub('Network Engineer - Tech Lounge & AV')).toBe('IT_DEVOPS');
    expect(sub('Database Administrator')).toBe('IT_DEVOPS');
    expect(sub('Ruby on Rails Developer (Middle/Senior)')).toBe('IT_BACKEND');
    expect(sub('Senior Backend Engineer (Java, Kotlin, English)')).toBe(
      'IT_BACKEND',
    );
    expect(sub('Nhân Viên IT Lập Trình')).toBe('IT_SWE');
  });

  test('chức danh IT chung chung là IT Support, xét SAU các nghề lập trình (đo 2026-10-25)', () => {
    expect(sub('Nhân viên IT')).toBe('IT_SUPPORT');
    expect(sub('Trưởng nhóm IT')).toBe('IT_SUPPORT');
    expect(sub('IT Specialist (Chinese Speaking)')).toBe('IT_SUPPORT');
    expect(sub('Nhân Viên IT (Power Platform Developer)')).toBe('IT_SWE');
    expect(sub('IT Engineer', ['IT Helpdesk', 'IT Hardware'])).toBe(
      'IT_SUPPORT',
    );
    expect(sub('Hardware Engineer')).toBe('IT_EMBEDDED');
  });

  test('lập trình game là nghề riêng, kể cả khi tiêu đề có chữ Fullstack (đo 2026-10-25)', () => {
    expect(sub('Mobile Game Developer Fullstack 5Xp Java, C++, C#, PHP')).toBe(
      'IT_GAME',
    );
    expect(sub('Middle Unity Developer (C#, .NET, WebGL)')).toBe('IT_GAME');
  });

  test('tin thiết kế có chữ "mobile" thuộc nhóm Thiết kế, không phải CNTT', () => {
    expect(resolveOccupation('UI Designer (Mobile App)', [])).toBe('DESIGN');
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

describe('nearbySubOccupations', () => {
  test('gồm chính nghề đó và các nghề gần', () => {
    expect(nearbySubOccupations('IT_FULLSTACK')).toEqual(
      expect.arrayContaining(['IT_FULLSTACK', 'IT_BACKEND', 'IT_FRONTEND']),
    );
    expect(nearbySubOccupations('IT_FULLSTACK')).not.toContain('IT_QA');
  });

  test('nghề chưa khai nghề gần thì chỉ còn chính nó', () => {
    expect(nearbySubOccupations('MED_NURSE')).toEqual(['MED_NURSE']);
  });

  test('mọi nghề khai trong nhóm gần đều có thật trong danh mục', () => {
    for (const code of Object.keys(SUB_OCCUPATION_PARENT)) {
      for (const near of nearbySubOccupations(code)) {
        expect(SUB_OCCUPATION_PARENT[near]).toBe(SUB_OCCUPATION_PARENT[code]);
      }
    }
  });
});
