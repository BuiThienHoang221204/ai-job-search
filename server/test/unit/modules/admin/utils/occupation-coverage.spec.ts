import { occupationCoverage } from 'src/modules/admin/utils/occupation-coverage.js';

describe('occupationCoverage', () => {
  it('ngành có tin thì không phải stale dù chưa quét trong cửa sổ', () => {
    const rows = occupationCoverage(new Map([['IT', 721]]), new Set());
    const it = rows.find((row) => row.code === 'IT')!;

    expect(it.jobCount).toBe(721);
    expect(it.stale).toBe(false);
  });

  it('ngành chưa từng được quét thì KHÔNG stale — còn trong chu kỳ phủ, không phải báo động', () => {
    const rows = occupationCoverage(new Map(), new Set());
    const hospitality = rows.find((row) => row.code === 'HOSPITALITY')!;

    expect(hospitality.attempted).toBe(false);
    expect(hospitality.jobCount).toBe(0);
    expect(hospitality.stale).toBe(false);
  });

  it('ngành ĐÃ quét mà vẫn 0 tin thì stale', () => {
    // HOS_KITCHEN là một nghề con của HOSPITALITY.
    const rows = occupationCoverage(new Map(), new Set(['HOS_KITCHEN']));
    const hospitality = rows.find((row) => row.code === 'HOSPITALITY')!;

    expect(hospitality.attempted).toBe(true);
    expect(hospitality.stale).toBe(true);
  });

  it('mã nhóm (nhánh lùi, không phải nghề con) cũng tính là đã quét', () => {
    const rows = occupationCoverage(new Map(), new Set(['HOSPITALITY']));
    const hospitality = rows.find((row) => row.code === 'HOSPITALITY')!;

    expect(hospitality.attempted).toBe(true);
  });

  it('bỏ OTHER — không phải một ngành thật để cảnh báo', () => {
    const rows = occupationCoverage(new Map(), new Set());
    expect(rows.some((row) => row.code === 'OTHER')).toBe(false);
  });

  it('quét được nhưng có tin thì không stale', () => {
    const rows = occupationCoverage(
      new Map([['FINANCE', 5]]),
      new Set(['FIN_ACCOUNTING']),
    );
    const finance = rows.find((row) => row.code === 'FINANCE')!;

    expect(finance.attempted).toBe(true);
    expect(finance.jobCount).toBe(5);
    expect(finance.stale).toBe(false);
  });
});
