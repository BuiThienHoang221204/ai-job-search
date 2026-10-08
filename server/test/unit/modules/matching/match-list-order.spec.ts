import { matchListOrder } from 'src/modules/matching/ai/utils/match-view.js';

describe('matchListOrder', () => {
  test('mặc định là lượt chấm mới nhất, không xét điểm', () => {
    const order = matchListOrder();
    expect(order[0]).toEqual({ evaluatedAt: { sort: 'desc', nulls: 'last' } });
    expect(order.some((item) => 'overallScore' in item)).toBe(false);
  });

  test('theo điểm thì điểm đứng đầu, hoà điểm lùi về lượt chấm mới nhất', () => {
    expect(matchListOrder('score_desc').slice(0, 2)).toEqual([
      { overallScore: { sort: 'desc', nulls: 'last' } },
      { evaluatedAt: { sort: 'desc', nulls: 'last' } },
    ]);
    expect(matchListOrder('score_asc')[0]).toEqual({
      overallScore: { sort: 'asc', nulls: 'last' },
    });
  });
});
