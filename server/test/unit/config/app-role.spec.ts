import { appRole, runsBackgroundWork } from 'src/config/app-role.js';

describe('appRole', () => {
  /// Mặc định `all` là ràng buộc chứ không phải tiện tay: bản đang chạy và cả
  /// bộ test đều giả định một tiến trình làm tất cả. Đổi mặc định là đổi hành
  /// vi của mọi deploy chưa khai APP_ROLE.
  test('không khai thì là all', () => {
    expect(appRole({})).toBe('all');
    expect(appRole({ APP_ROLE: '' })).toBe('all');
    expect(appRole({ APP_ROLE: '   ' })).toBe('all');
  });

  test('đọc được cả ba vai, không phân biệt hoa thường', () => {
    expect(appRole({ APP_ROLE: 'api' })).toBe('api');
    expect(appRole({ APP_ROLE: 'WORKER' })).toBe('worker');
    expect(appRole({ APP_ROLE: ' All ' })).toBe('all');
  });

  /// Ném lỗi thay vì lùi về mặc định: gõ nhầm `APP_ROLE=worker1` mà lùi về
  /// `all` thì mọi bản API đều chạy cron, và triệu chứng là bị portal chặn IP
  /// vài ngày sau - không cách nào lần ngược về nguyên nhân.
  test('giá trị lạ thì ném lỗi ngay', () => {
    expect(() => appRole({ APP_ROLE: 'worker1' })).toThrow(/APP_ROLE/);
    expect(() => appRole({ APP_ROLE: 'cron' })).toThrow(/api, worker, all/);
  });
});

describe('runsBackgroundWork', () => {
  test('chỉ vai api là không chạy việc nền', () => {
    expect(runsBackgroundWork('api')).toBe(false);
    expect(runsBackgroundWork('worker')).toBe(true);
    expect(runsBackgroundWork('all')).toBe(true);
  });
});
