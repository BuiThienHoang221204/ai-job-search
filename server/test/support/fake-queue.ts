import { singletonKeyFor } from 'src/modules/queue/queue-key.js';
import type { Queue, QueueStatus } from 'src/modules/queue/queue.service.js';

type Sent = { queue: string; key: string; data: object };

/// Trần an toàn cho `drain()`. Một worker được phép gửi thêm việc, nên vòng lặp
/// có thể tự nuôi nó mãi; chạm trần là dấu hiệu vòng lặp vô hạn chứ không phải
/// dấu hiệu cần nâng trần.
const MAX_DRAIN = 100;

/// Bản giả của `QueueService` cho test.
///
/// Ba lý do phải thay bản thật, không chỉ vì tiện:
///
/// 1. `QueueService` thật khởi động pg-boss và ĐĂNG KÝ WORKER trong
///    `onModuleInit`. Để nguyên thì mỗi lần chạy test là các worker bắt đầu poll
///    và gọi model thật.
/// 2. Việc nền chạy bất đồng bộ thì test phải chờ bằng thời gian, tức là test
///    chập chờn. `drain()` biến chuỗi việc nền thành một lời gọi xác định.
/// 3. Nó bắt chước cả hành vi CHẶN TRÙNG của policy `exclusive`, dùng đúng hàm
///    `singletonKeyFor` mà bản thật dùng. Nếu bỏ qua điều này thì test sẽ thấy
///    hai việc trùng được xếp hai lần trong khi production chỉ xếp một - và mọi
///    khẳng định về số lượt gọi model thành vô nghĩa.
export class FakeQueue implements Queue {
  readonly sent: Sent[] = [];

  private readonly handlers = new Map<
    string,
    (data: object) => Promise<void>
  >();
  private nextId = 1;

  /// Xếp một việc, trả về id hoặc null nếu đã có việc y hệt đang chờ.
  private enqueue(queue: string, data: object): string | null {
    const key = singletonKeyFor(queue, data);
    const duplicate = this.sent.some(
      (item) => item.queue === queue && item.key === key,
    );
    if (duplicate) return null;

    this.sent.push({ queue, key, data });
    return `fake-job-${this.nextId++}`;
  }

  send<T extends object>(queue: string, data: T): Promise<string | null> {
    return Promise.resolve(this.enqueue(queue, data));
  }

  sendMany<T extends object>(queue: string, items: T[]): Promise<number> {
    const queued = items.filter(
      (data) => this.enqueue(queue, data) !== null,
    ).length;
    return Promise.resolve(queued);
  }

  work<T extends object>(
    queue: string,
    handler: (data: T) => Promise<void>,
  ): Promise<void> {
    this.handlers.set(queue, handler);
    return Promise.resolve();
  }

  /// Bản giả luôn coi như đã khởi tạo xong: nó không mở kết nối nào.
  ///
  /// Đặt được thành lỗi để test readiness probe dựng được ca hàng đợi hỏng.
  statusOverride: QueueStatus = { ready: true, error: null };

  status(): QueueStatus {
    return this.statusOverride;
  }

  /// Các payload đã được gửi vào một queue, theo thứ tự gửi.
  sentTo(queue: string): object[] {
    return this.sent.filter((item) => item.queue === queue).map((i) => i.data);
  }

  /// Chạy các message đã gửi qua đúng worker đã đăng ký, cho tới khi không còn
  /// gì xử lý được.
  ///
  /// Lặp thay vì quét một lượt là có ý: một worker có thể gửi thêm việc (tạo đơn
  /// ứng tuyển kéo theo sinh CV và thư xin việc), và test cần cả chuỗi đó chạy
  /// hết mới khẳng định được kết quả cuối.
  ///
  /// Message vào queue chưa có worker thì được để nguyên trong `sent` - đó là
  /// thông tin, không phải rác: nó cho biết có việc được đẩy đi mà không ai nhận.
  async drain(): Promise<number> {
    let processed = 0;

    while (processed < MAX_DRAIN) {
      const index = this.sent.findIndex((item) =>
        this.handlers.has(item.queue),
      );
      if (index === -1) return processed;

      const item = this.sent[index];
      const handler = this.handlers.get(item.queue);
      if (!handler) return processed;

      // Rời khỏi hàng đợi TRƯỚC khi chạy: bản thật cũng vậy, và nhờ đó một
      // worker xếp lại đúng việc của nó không bị coi là trùng.
      this.sent.splice(index, 1);
      await handler(item.data);
      processed += 1;
    }

    throw new Error(
      `FakeQueue.drain() đã xử lý ${MAX_DRAIN} message mà vẫn còn việc. ` +
        'Gần như chắc chắn có một worker tự gửi lại vào queue của chính nó.',
    );
  }

  /// Xoá message đã gửi, GIỮ các worker đã đăng ký.
  ///
  /// Worker được đăng ký một lần lúc module khởi động, nên xoá chúng giữa hai
  /// test sẽ làm `drain()` của test sau không còn ai nhận việc.
  reset(): void {
    this.sent.length = 0;
    this.nextId = 1;
  }
}
