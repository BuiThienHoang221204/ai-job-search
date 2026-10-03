import { ConcurrencyGate } from 'src/modules/ai/utils/concurrency-gate.js';

describe('ConcurrencyGate', () => {
  test('lõi không khai trần thì chạy ngay, không giữ vé', async () => {
    const gate = new ConcurrencyGate({ opencode: undefined });
    const release = await gate.acquire('opencode');
    expect(typeof release).toBe('function');
  });

  test('lõi lạ chưa từng khai cũng chạy ngay', async () => {
    const gate = new ConcurrencyGate({ opencode: 2 });
    const release = await gate.acquire('openrouter');
    expect(typeof release).toBe('function');
  });

  test('trong hạn mức thì acquire ngay, không chờ', async () => {
    const gate = new ConcurrencyGate({ opencode: 2 });
    const order: string[] = [];

    const r1 = await gate.acquire('opencode');
    order.push('acquired-1');
    const r2 = await gate.acquire('opencode');
    order.push('acquired-2');

    expect(order).toEqual(['acquired-1', 'acquired-2']);
    r1();
    r2();
  });

  test('vượt hạn mức thì phải chờ tới khi có người trả vé', async () => {
    const gate = new ConcurrencyGate({ opencode: 1 });
    const order: string[] = [];

    const release1 = await gate.acquire('opencode');
    order.push('acquired-1');

    const second = gate.acquire('opencode').then((release2) => {
      order.push('acquired-2');
      release2();
    });

    // Chưa trả vé thì lượt 2 chưa được chạy.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(['acquired-1']);

    release1();
    await second;
    expect(order).toEqual(['acquired-1', 'acquired-2']);
  });

  test('nhiều người chờ thì trả vé theo đúng thứ tự tới trước (FIFO)', async () => {
    const gate = new ConcurrencyGate({ opencode: 1 });
    const order: number[] = [];

    const release1 = await gate.acquire('opencode');
    const p2 = gate.acquire('opencode').then((r) => {
      order.push(2);
      return r;
    });
    const p3 = gate.acquire('opencode').then((r) => {
      order.push(3);
      return r;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    release1();
    const release2 = await p2;
    release2();
    const release3 = await p3;
    release3();

    expect(order).toEqual([2, 3]);
  });

  test('gọi release hai lần không làm hỏng bộ đếm', async () => {
    const gate = new ConcurrencyGate({ opencode: 1 });
    const release1 = await gate.acquire('opencode');
    release1();
    release1();

    const release2 = await gate.acquire('opencode');
    expect(typeof release2).toBe('function');
  });

  test('trần 0 hoặc số âm coi như không giới hạn', async () => {
    const gate = new ConcurrencyGate({ opencode: 0 });
    const release1 = await gate.acquire('opencode');
    const release2 = await gate.acquire('opencode');
    expect(typeof release1).toBe('function');
    expect(typeof release2).toBe('function');
  });
});
