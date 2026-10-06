import { fastModelChain, modelIdsFrom } from 'src/common/model-env.js';

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

describe('fastModelChain', () => {
  const ORIGINAL_MODEL = process.env.AI_FAST_MODEL_ID;
  const ORIGINAL_FALLBACKS = process.env.AI_FAST_FALLBACK_IDS;

  afterEach(() => {
    if (ORIGINAL_MODEL === undefined) delete process.env.AI_FAST_MODEL_ID;
    else process.env.AI_FAST_MODEL_ID = ORIGINAL_MODEL;
    if (ORIGINAL_FALLBACKS === undefined)
      delete process.env.AI_FAST_FALLBACK_IDS;
    else process.env.AI_FAST_FALLBACK_IDS = ORIGINAL_FALLBACKS;
  });

  it('không đặt biến môi trường thì trả undefined cho cả modelId và fallbackModelIds', () => {
    delete process.env.AI_FAST_MODEL_ID;
    delete process.env.AI_FAST_FALLBACK_IDS;
    expect(fastModelChain(100)).toEqual({
      modelId: undefined,
      fallbackModelIds: undefined,
    });
  });

  it('đặt AI_FAST_MODEL_ID và AI_FAST_FALLBACK_IDS thì chọn model còn chỗ', () => {
    process.env.AI_FAST_MODEL_ID = 'groq/openai/gpt-oss-120b';
    process.env.AI_FAST_FALLBACK_IDS =
      'gemini/models/gemini-3.5-flash-lite, unorouter/m1:free';
    const chain = fastModelChain(100);
    expect(chain.modelId).toBe('groq/openai/gpt-oss-120b');
    expect(chain.fallbackModelIds).toEqual([
      'gemini/models/gemini-3.5-flash-lite',
      'unorouter/m1:free',
    ]);
  });
});
