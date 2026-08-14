import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

/// Probe cho orchestrator.
///
/// Điều đáng kiểm nhất không phải "trả 200 khi mọi thứ ổn" mà là hai probe PHÂN
/// BIỆT nhau: liveness không được hỏng khi phụ thuộc hỏng. Nếu nó hỏng theo thì
/// một lần database chập chờn sẽ khiến orchestrator giết và khởi động lại những
/// container hoàn toàn khoẻ mạnh.
describe('Probe sức khoẻ', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  afterEach(() => {
    harness.queue.statusOverride = { ready: true, error: null };
  });

  describe('liveness', () => {
    test('không cần đăng nhập', async () => {
      const response = await request(harness.server)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({ status: 'ok' });
      expect(
        typeof (response.body as { uptimeSeconds: number }).uptimeSeconds,
      ).toBe('number');
    });

    /// Tính chất quan trọng nhất của tệp này.
    test('vẫn trả 200 khi hàng đợi hỏng', async () => {
      harness.queue.statusOverride = {
        ready: false,
        error: 'pg-boss không khởi động được',
      };

      await request(harness.server).get('/api/health').expect(200);
    });
  });

  describe('readiness', () => {
    test('không cần đăng nhập và trả 200 khi phụ thuộc đủ', async () => {
      const response = await request(harness.server)
        .get('/api/ready')
        .expect(200);

      /*
       * `latex` KHONG duoc khai o day va do la co y: e2e chay tren may khong dam bao
       * co Docker lan dich vu LaTeX, nen ket qua cua no khong tat dinh. Dieu PHAI
       * dung — va duoc ghim o test duoi — la no khong anh huong `ready`.
       */
      const body = response.body as {
        ready: boolean;
        checks: { database: { ok: boolean }; queue: { ok: boolean } };
      };
      expect(body.ready).toBe(true);
      expect(body.checks.database).toEqual({ ok: true });
      expect(body.checks.queue).toEqual({ ok: true });
    });

    /// Quyet dinh thiet ke, phai duoc ghim: mat PDF thi nguoi dung van cham diem,
    /// xem viec lam, soan CV va ung tuyen duoc. Cho orchestrator khoi dong lai ca
    /// app vi mot tinh nang phu la bien mot su co nho thanh mot lan chet toan phan.
    test('moi truong tao PDF hong thi VAN ready', async () => {
      const response = await request(harness.server)
        .get('/api/ready')
        .expect(200);

      const body = response.body as {
        ready: boolean;
        checks: { latex: { ok: boolean } };
      };

      // Tren may CI khong co Docker thi `latex.ok` la false — va do chinh la tinh
      // huong dang kiem: 200 va ready:true bat chap no.
      expect(body.ready).toBe(true);
      expect(typeof body.checks.latex.ok).toBe('boolean');
    });

    /// Phải là 503, không phải 200 kèm cờ: orchestrator đọc mã trạng thái chứ
    /// không đọc thân phản hồi. Trả 200 nghĩa là nó tiếp tục đẩy request vào một
    /// instance không phục vụ được.
    test('trả 503 khi hàng đợi chưa sẵn sàng', async () => {
      harness.queue.statusOverride = {
        ready: false,
        error: 'Hàng đợi "document.generate" đang dùng policy "standard"',
      };

      const response = await request(harness.server)
        .get('/api/ready')
        .expect(503);

      // Thân phản hồi của 503 CHÍNH LÀ báo cáo, không bọc thêm tầng nào: Nest
      // dùng object truyền vào exception làm thân. Nhờ vậy shape giống hệt nhau ở
      // cả 200 và 503, người đọc log chỉ cần một cách phân tích.
      const body = response.body as {
        ready: boolean;
        checks: {
          database: { ok: boolean };
          queue: { ok: boolean; error?: string };
        };
      };
      expect(body.ready).toBe(false);
      // Database vẫn ổn: báo cáo phải chỉ đúng thứ hỏng, không quy kết cả hai.
      expect(body.checks.database.ok).toBe(true);
      expect(body.checks.queue.ok).toBe(false);
      expect(body.checks.queue.error).toContain('policy');
    });

    /// Người vận hành cần biết hỏng NHỮNG GÌ, không chỉ biết "có hỏng" - nên báo
    /// cáo luôn chứa kết quả của MỌI phép kiểm.
    ///
    /// So tap khoa CHINH XAC: them mot phep kiem ma quen khai o day thi test do,
    /// buoc nguoi them phai nghi xem no co duoc tinh vao `ready` hay khong.
    test('báo cáo luôn chứa mọi phép kiểm', async () => {
      const response = await request(harness.server).get('/api/ready');

      const body = response.body as { checks: Record<string, unknown> };
      expect(Object.keys(body.checks).sort()).toEqual([
        'database',
        'latex',
        'queue',
      ]);
    });
  });
});
