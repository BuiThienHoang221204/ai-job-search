import { Client } from 'pg';

/// Tên database dùng cho test BẮT BUỘC kết thúc bằng hậu tố này.
///
/// Bộ khung test `TRUNCATE` mọi bảng giữa các test. Chạy nhầm vào database phát
/// triển là mất sạch dữ liệu mà không có một dòng cảnh báo nào, nên đây là chốt
/// cứng chứ không phải quy ước đặt tên.
const REQUIRED_SUFFIX = '_test';

/// Bảng lịch sử migration của Prisma. Không được truncate: mất nó thì lần chạy
/// sau `migrate deploy` sẽ tưởng chưa có migration nào và áp lại từ đầu.
const MIGRATIONS_TABLE = '_prisma_migrations';

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/// Đường kết nối tới database test.
///
/// CỐ Ý không rơi về `DATABASE_URL` khi thiếu biến. Một đường rơi về ở đây
/// nghĩa là chỉ cần quên đặt biến môi trường là toàn bộ dữ liệu phát triển bị
/// xoá - kiểu hỏng tệ nhất vì nó im lặng và không thể hoàn lại.
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      [
        'TEST_DATABASE_URL chưa được đặt. Thêm vào server/.env:',
        '  TEST_DATABASE_URL="postgresql://aijob:aijob_dev_password@localhost:5432/aijob_test?schema=public"',
        'Không có đường rơi về DATABASE_URL: test sẽ xoá sạch mọi bảng trong database nó trỏ tới.',
      ].join('\n'),
    );
  }

  const name = databaseName(url);
  if (!name.endsWith(REQUIRED_SUFFIX)) {
    throw new Error(
      `TEST_DATABASE_URL trỏ tới database "${name}", không kết thúc bằng "${REQUIRED_SUFFIX}". ` +
        'Từ chối chạy vì bộ khung test sẽ TRUNCATE mọi bảng trong đó.',
    );
  }

  return url;
}

/// Tạo database test nếu chưa có.
///
/// `prisma migrate deploy` cần database tồn tại sẵn (khác `migrate dev`), nên
/// bước này phải đi trước. Kết nối vào database `postgres` mặc định vì không thể
/// `CREATE DATABASE` từ bên trong chính nó.
export async function ensureTestDatabase(url: string): Promise<void> {
  const name = databaseName(url);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (existing.rowCount === 0) {
      // CREATE DATABASE không nhận tham số bind, nên tên phải nội suy. Tên đã
      // qua cửa `testDatabaseUrl()`, và dấu ngoặc kép được nhân đôi để một tên
      // có ký tự lạ cũng không thoát ra khỏi định danh.
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

/// Xoá mọi việc còn tồn trong hàng đợi pg-boss.
///
/// `truncateAll` chỉ chạm schema `public`, còn pg-boss sống ở schema `pgboss`.
/// Không dọn thì việc của lần chạy trước còn nguyên, và test về chặn trùng sẽ
/// đỏ ở lần chạy thứ hai vì khoá đã bị chiếm - loại test đỏ vô cớ khiến người ta
/// mất niềm tin vào cả bộ test.
///
/// Bỏ qua trường hợp schema chưa tồn tại: lần chạy đầu tiên thì pg-boss chưa
/// cài, và đó không phải lỗi.
export async function purgePgBossJobs(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE pgboss.job');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/does not exist/i.test(message)) throw error;
  } finally {
    await client.end();
  }
}

/// Chỉ cần đúng hai phương thức raw của Prisma. Nhận theo hình dạng thay vì
/// import `PrismaService` để file này không phụ thuộc vào cây module của app.
type RawExecutor = {
  $queryRawUnsafe<T>(query: string): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
};

/// Xoá sạch dữ liệu, giữ lược đồ.
///
/// Đọc danh sách bảng từ `pg_tables` chứ không khai cứng: thêm bảng mới vào
/// schema.prisma là nó tự được dọn, không ai phải nhớ cập nhật chỗ này.
export async function truncateAll(db: RawExecutor): Promise<void> {
  const rows = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '${MIGRATIONS_TABLE}'`,
  );
  if (!rows.length) return;

  const list = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  // CASCADE vì các bảng tham chiếu nhau bằng khoá ngoại; RESTART IDENTITY để
  // chuỗi số tự tăng không mang trạng thái của test trước sang test sau.
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
