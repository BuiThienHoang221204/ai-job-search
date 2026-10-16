import configuration from 'src/config/configuration.js';

describe('configuration — biến số nguyên', () => {
  afterEach(() => {
    delete process.env.PORT;
  });

  test('chưa đặt hoặc rỗng thì dùng giá trị mặc định', () => {
    process.env.PORT = '';
    expect(configuration().port).toBe(4_000);
  });

  test('giá trị không phải số nguyên thì app không khởi động', () => {
    process.env.PORT = '40OO';
    expect(() => configuration()).toThrow('PORT phải là số nguyên');
  });
});
