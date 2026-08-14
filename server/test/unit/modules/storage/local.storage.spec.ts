import type { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage } from 'src/modules/storage/local.storage.js';
import { userKey } from 'src/modules/storage/storage.interface.js';

let root: string;
let storage: LocalStorage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aijob-storage-'));
  const config = { get: () => root } as unknown as ConfigService;
  storage = new LocalStorage(config);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('chặn thoát khỏi workspace', () => {
  // Khóa được ghép từ tên công ty và chức danh do model sinh ra, nên một khóa
  // dạng "../../server/.env" là khả năng thật chứ không phải giả định.
  test.each([
    ['../.env', 'lên một cấp'],
    ['../../server/.env', 'lên hai cấp'],
    ['user1/../../escape.txt', 'thoát ở giữa đường dẫn'],
    ['/etc/passwd', 'đường dẫn tuyệt đối kiểu unix'],
    ['C:/Windows/system32/config', 'đường dẫn tuyệt đối kiểu windows'],
    ['..\\..\\escape.txt', 'dùng dấu gạch ngược'],
  ])('từ chối %s (%s)', async (key) => {
    await expect(storage.write(key, 'x')).rejects.toThrow();
  });

  test('cho phép khóa hợp lệ', async () => {
    await expect(
      storage.write('user1/cv/main.tex', 'noi dung'),
    ).resolves.toBeUndefined();
  });

  test('cho phép dấu chấm trong tên file', async () => {
    await expect(
      storage.write('user1/cv/main.v2.tex', 'x'),
    ).resolves.toBeUndefined();
  });
});

describe('đọc ghi', () => {
  test('ghi rồi đọc lại được nguyên văn', async () => {
    await storage.write('user1/cv/main.tex', 'Xin chào — nội dung tiếng Việt');
    expect(await storage.readText('user1/cv/main.tex')).toBe(
      'Xin chào — nội dung tiếng Việt',
    );
  });

  test('tự tạo thư mục cha', async () => {
    await storage.write('user1/a/b/c/deep.txt', 'sau');
    expect(await readFile(join(root, 'user1/a/b/c/deep.txt'), 'utf8')).toBe(
      'sau',
    );
  });

  test('exists phân biệt đúng có và không', async () => {
    await storage.write('user1/co.txt', 'x');
    expect(await storage.exists('user1/co.txt')).toBe(true);
    expect(await storage.exists('user1/khong.txt')).toBe(false);
  });

  test('exists trả false thay vì ném lỗi khi khóa xấu', async () => {
    // Đường dẫn tuyệt đối bị resolveKey ném lỗi, nhưng exists phải nuốt lại.
    expect(await storage.exists('/etc/passwd')).toBe(false);
  });

  test('delete xóa được', async () => {
    await storage.write('user1/xoa.txt', 'x');
    await storage.delete('user1/xoa.txt');
    expect(await storage.exists('user1/xoa.txt')).toBe(false);
  });

  test('delete file không tồn tại không ném lỗi', async () => {
    await expect(storage.delete('user1/khong-co.txt')).resolves.toBeUndefined();
  });
});

describe('list', () => {
  test('liệt kê đệ quy và trả khóa đúng định dạng', async () => {
    await storage.write('user1/cv/a.tex', 'a');
    await storage.write('user1/cv/nested/b.tex', 'bb');
    await storage.write('user2/cv/c.tex', 'ccc');

    const items = await storage.list('user1');
    const keys = items.map((item) => item.key).sort();

    expect(keys).toEqual(['user1/cv/a.tex', 'user1/cv/nested/b.tex']);
    // Không được lấn sang workspace của người khác.
    expect(keys.some((key) => key.startsWith('user2'))).toBe(false);
  });

  test('trả kích thước thật', async () => {
    await storage.write('user1/x.txt', 'abcde');
    const [item] = await storage.list('user1');
    expect(item.size).toBe(5);
  });

  test('prefix không tồn tại trả mảng rỗng', async () => {
    expect(await storage.list('khong-co-user')).toEqual([]);
  });
});

describe('userKey', () => {
  test('luôn bắt đầu bằng userId', () => {
    expect(userKey('clx123', 'cv', 'main.tex')).toBe('clx123/cv/main.tex');
  });

  test('dùng dấu gạch xuôi kể cả trên Windows', () => {
    expect(userKey('u', 'a', 'b')).not.toContain('\\');
  });
});
