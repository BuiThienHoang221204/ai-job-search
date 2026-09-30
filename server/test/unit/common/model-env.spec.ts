import { modelIdsFrom } from 'src/common/model-env.js';

describe('modelIdsFrom', () => {
  it('tách theo dấu phẩy và trim từng phần tử', () => {
    expect(modelIdsFrom('groq/a, groq/b ,groq/c')).toEqual([
      'groq/a',
      'groq/b',
      'groq/c',
    ]);
  });

  it('bỏ phần tử rỗng do dấu phẩy thừa', () => {
    expect(modelIdsFrom('groq/a,,groq/b,')).toEqual(['groq/a', 'groq/b']);
  });

  it('undefined hoặc rỗng thì trả undefined, KHÔNG phải mảng rỗng', () => {
    // Mảng rỗng là override "không mắt xích dự phòng nào" — sẽ xoá mất
    // MODEL_FALLBACK_IDS mặc định ở ModelChain. undefined mới đúng nghĩa
    // "chưa đặt, dùng chuỗi mặc định".
    expect(modelIdsFrom(undefined)).toBeUndefined();
    expect(modelIdsFrom('')).toBeUndefined();
    expect(modelIdsFrom('   ')).toBeUndefined();
  });

  it('chỉ toàn dấu phẩy/khoảng trắng thì cũng là undefined', () => {
    expect(modelIdsFrom(' , , ,')).toBeUndefined();
  });
});
