import { QUEUE, QueueService } from 'src/modules/queue/queue.service.js';
import { purgePgBossJobs, testDatabaseUrl } from './support/test-database.js';

/// Hợp đồng chặn trùng của hàng đợi, kiểm trên pg-boss THẬT.
///
/// Đây là tệp duy nhất trong bộ e2e không dùng `FakeQueue`, và có lý do: bản giả
/// không thể chứng minh điều cần chứng minh ở đây. Việc chặn trùng do policy của
/// pg-boss thực hiện, nên nếu chỉ kiểm bằng bản giả thì ta chỉ đang kiểm chính
/// niềm tin của mình.
///
/// Bối cảnh: bản thiết kế đầu tiên nói "thêm `singletonKey` là xong". Điều đó
/// SAI - `singletonKey` một mình không làm gì trên policy mặc định `standard`.
/// Test cuối tệp này ghim lại đúng sự thật đó, để lần sau ai định "đơn giản hoá"
/// bằng cách bỏ policy đi thì có một test đỏ giải thích tại sao không được.
describe('Chặn trùng trên hàng đợi thật', () => {
  let queue: QueueService;

  beforeAll(async () => {
    queue = new QueueService();
    queue.onModuleInit();

    // Một lời gọi rỗng để chờ pg-boss khởi động xong (nó cài schema và tạo hàng
    // đợi trong `onModuleInit`); `sendMany` await xong phần khởi tạo rồi mới xét
    // mảng rỗng.
    await queue.sendMany(QUEUE.GENERATE_DOCUMENT, []);

    // Dọn việc còn tồn từ lần chạy trước, nếu không khoá đã bị chiếm và mọi
    // khẳng định dưới đây đỏ vô cớ ở lần chạy thứ hai.
    await purgePgBossJobs(testDatabaseUrl());
  });

  afterAll(async () => {
    await queue.onApplicationShutdown();
    // Dọn cả khi kết thúc, không chỉ lúc bắt đầu. Việc xếp vào đây là việc THẬT
    // trong pg-boss: bỏ lại thì worker của lần chạy tiếp theo - hoặc của một
    // container trỏ vào database test - sẽ nhặt lấy và cố xử lý những payload chỉ
    // tồn tại trong test. Đã thấy đúng chuyện đó khi chạy thử image.
    await purgePgBossJobs(testDatabaseUrl());
  });

  test('xếp hai lần cùng một tài liệu thì lần thứ hai bị bỏ', async () => {
    const payload = { userId: 'u1', documentId: 'tai-lieu-trung' };

    const first = await queue.send(QUEUE.GENERATE_DOCUMENT, payload);
    const second = await queue.send(QUEUE.GENERATE_DOCUMENT, payload);

    expect(first).not.toBeNull();
    // null nghĩa là "đã có việc y hệt đang chờ", không phải lỗi.
    expect(second).toBeNull();
  });

  test('hai tài liệu khác nhau đều được xếp', async () => {
    const first = await queue.send(QUEUE.GENERATE_DOCUMENT, {
      userId: 'u1',
      documentId: 'tai-lieu-a',
    });
    const second = await queue.send(QUEUE.GENERATE_DOCUMENT, {
      userId: 'u1',
      documentId: 'tai-lieu-b',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });

  test('cùng công việc nhưng khác người dùng thì không bị coi là trùng', async () => {
    const first = await queue.send(QUEUE.EVALUATE_MATCH, {
      userId: 'nguoi-1',
      jobId: 'viec-chung',
    });
    const second = await queue.send(QUEUE.EVALUATE_MATCH, {
      userId: 'nguoi-2',
      jobId: 'viec-chung',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });

  /// Yêu cầu chấm LẠI phải đi được kể cả khi đang có một lượt chấm thường chờ
  /// sẵn, vì lượt kia sẽ trả kết quả cache.
  test('force=true không bị gộp vào lượt chấm thường đang chờ', async () => {
    const base = { userId: 'nguoi-force', jobId: 'viec-force' };

    const normal = await queue.send(QUEUE.EVALUATE_MATCH, base);
    const forced = await queue.send(QUEUE.EVALUATE_MATCH, {
      ...base,
      force: true,
    });

    expect(normal).not.toBeNull();
    expect(forced).not.toBeNull();
  });

  /// N+1: fan-out của hệ thống có trần 500 cặp, trước đây là 500 lệnh tuần tự.
  test('sendMany xếp cả lô và bỏ qua phần tử trùng', async () => {
    const items = [
      { userId: 'lo-1', jobId: 'viec-1' },
      { userId: 'lo-1', jobId: 'viec-2' },
      // Trùng với phần tử đầu: phải bị bỏ, và KHÔNG được làm hỏng cả lô.
      { userId: 'lo-1', jobId: 'viec-1' },
      { userId: 'lo-2', jobId: 'viec-1' },
    ];

    const queued = await queue.sendMany(QUEUE.EVALUATE_MATCH, items);

    expect(queued).toBe(3);
  });

  test('sendMany với mảng rỗng không làm gì', async () => {
    await expect(queue.sendMany(QUEUE.EVALUATE_MATCH, [])).resolves.toBe(0);
  });

  test('payload thiếu trường khoá bị từ chối ngay, không vào hàng đợi', async () => {
    await expect(
      queue.send(QUEUE.GENERATE_DOCUMENT, { userId: 'u1' }),
    ).rejects.toThrow(/documentId/);
  });

  /// BẰNG CHỨNG cho lý do phải đổi policy.
  ///
  /// Dùng pg-boss trực tiếp trên một hàng đợi nháp: cùng một `singletonKey`,
  /// nhưng policy `standard` thì CẢ HAI việc đều vào hàng đợi. Đó chính là hành
  /// vi mà bản thiết kế đầu tiên tưởng là chặn trùng.
  test('policy standard KHÔNG chặn trùng dù có singletonKey', async () => {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: testDatabaseUrl(),
      schema: 'pgboss',
      max: 2,
    });
    await boss.start();

    const scratch = 'test.policy-standard';
    try {
      await boss.createQueue(scratch, { policy: 'standard' });

      const first = await boss.send(scratch, { x: 1 }, { singletonKey: 'k' });
      const second = await boss.send(scratch, { x: 1 }, { singletonKey: 'k' });

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
    } finally {
      await boss.deleteQueue(scratch);
      await boss.stop({ graceful: false });
    }
  });

  /// Nâng cấp policy cho database đã chạy trước thay đổi này.
  ///
  /// Đây là nhánh sẽ thực sự chạy trên máy của người phát triển: database dev đã
  /// có 5 hàng đợi tạo bằng policy mặc định `standard`. pg-boss KHÔNG cho đổi
  /// policy qua `updateQueue`, nên cách duy nhất là xoá và tạo lại - mà xoá là
  /// mất việc đang chờ. Hai test dưới đây ghim đúng ranh giới đó.
  describe('nâng cấp policy của hàng đợi đã tồn tại', () => {
    /// Dùng UPSKILL_REPORT làm hàng đợi thí nghiệm: nó không bị test nào khác
    /// trong tệp này chạm tới.
    const target = QUEUE.UPSKILL_REPORT;

    const openBoss = async () => {
      const { PgBoss } = await import('pg-boss');
      const boss = new PgBoss({
        connectionString: testDatabaseUrl(),
        schema: 'pgboss',
        max: 2,
      });
      await boss.start();
      return boss;
    };

    /// Dựng một QueueService mới và chờ nó khởi tạo xong. Trả về chính promise
    /// khởi tạo để test khẳng định được cả trường hợp nó từ chối.
    const bootFresh = async (service: QueueService) => {
      service.onModuleInit();
      await service.sendMany(target, []);
    };

    afterEach(() => {
      delete process.env.QUEUE_POLICY_MIGRATE;
    });

    /// Mặc định KHÔNG tự xoá. Đây là hành vi quan trọng hơn cả việc nâng cấp
    /// được: xoá hàng đợi là bỏ mất việc của người dùng, và không có con số nào
    /// đáng tin để máy tự quyết định thay người.
    test('mặc định thì từ chối khởi động thay vì tự xoá hàng đợi', async () => {
      const boss = await openBoss();
      const fresh = new QueueService();
      try {
        await boss.deleteQueue(target);
        await boss.createQueue(target, { policy: 'standard' });

        await expect(bootFresh(fresh)).rejects.toThrow(
          /QUEUE_POLICY_MIGRATE=true/,
        );

        // Hàng đợi vẫn nguyên policy cũ: không có gì bị xoá sau lần từ chối.
        expect((await boss.getQueue(target))?.policy).toBe('standard');
      } finally {
        await fresh.onApplicationShutdown();
        await boss.stop({ graceful: false });
      }
    });

    test('có QUEUE_POLICY_MIGRATE=true thì nâng cấp policy', async () => {
      const boss = await openBoss();
      const fresh = new QueueService();
      try {
        await boss.deleteQueue(target);
        await boss.createQueue(target, { policy: 'standard' });
        process.env.QUEUE_POLICY_MIGRATE = 'true';

        await bootFresh(fresh);

        expect((await boss.getQueue(target))?.policy).toBe('exclusive');
      } finally {
        await fresh.onApplicationShutdown();
        await boss.stop({ graceful: false });
      }
    });
  });
});
