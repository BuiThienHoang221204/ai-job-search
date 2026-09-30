import {
  MAX_QUERIES,
  clusterProfiles,
  clusterQuery,
  occupationGroupOf,
  planFromProfile,
  taxonomyBaseline,
} from 'src/modules/scraper/utils/query-plan.js';
import { SUB_OCCUPATIONS } from 'src/modules/jobs/taxonomy/sub-occupations.js';
import type { QueryProfile } from 'src/modules/scraper/types.js';

const profile = (overrides: Partial<QueryProfile> = {}): QueryProfile => ({
  headline: null,
  location: null,
  primarySkills: [],
  targetSectors: [],
  ...overrides,
});

/**
 * Hồ sơ kế toán: kỹ năng chính KHÔNG dùng làm từ khoá tìm việc được. Đây là
 * trường hợp mà bản đầu tiên của scraper làm sai, nên nó xuất hiện xuyên suốt
 * file này.
 */
const ketToan = profile({
  headline: 'Kế toán tổng hợp',
  location: 'Ha Noi',
  primarySkills: ['Excel', 'Misa', 'Báo cáo thuế', 'Giao tiếp'],
  targetSectors: ['Ngân hàng', 'Sản xuất'],
});

const lapTrinh = profile({
  headline: 'Senior React Developer',
  location: 'Ho Chi Minh',
  primarySkills: ['React', 'NestJS', 'TypeScript'],
  targetSectors: ['Fintech'],
});

describe('planFromProfile', () => {
  it('đặt chức danh lên đầu, không phải kỹ năng', () => {
    expect(planFromProfile(ketToan)[0].query).toBe('Kế toán tổng hợp');
    expect(planFromProfile(lapTrinh)[0].query).toBe('Senior React Developer');
  });

  it('ghép chức danh với lĩnh vực mục tiêu thay vì để lĩnh vực đứng riêng', () => {
    const queries = planFromProfile(ketToan).map((q) => q.query);

    expect(queries).toContain('Kế toán tổng hợp Ngân hàng');
    // Lĩnh vực đứng một mình trả về mọi vị trí trong ngành, từ giao dịch viên
    // tới bảo vệ - đó là lý do có hàm này.
    expect(queries).not.toContain('Ngân hàng');
    expect(queries).not.toContain('Sản xuất');
  });

  it('xếp kỹ năng sau chức danh và lĩnh vực', () => {
    const queries = planFromProfile(ketToan).map((q) => q.query);
    const viTriKyNang = queries.indexOf('Excel');
    const viTriLinhVuc = queries.indexOf('Kế toán tổng hợp Ngân hàng');

    expect(viTriKyNang).toBeGreaterThan(viTriLinhVuc);
  });

  it('không sinh truy vấn nào khi hồ sơ trống', () => {
    // Trước đây chỗ này lùi về 'developer'. Với một trợ lý tìm việc đa ngành
    // thì đó là câu trả lời sai cho mọi người trừ dân IT.
    expect(planFromProfile(profile())).toEqual([]);
    expect(planFromProfile(null)).toEqual([]);
  });

  it('không lấy lĩnh vực làm truy vấn khi hồ sơ thiếu chức danh', () => {
    const queries = planFromProfile(
      profile({ targetSectors: ['Ngân hàng'], primarySkills: ['Excel'] }),
    ).map((q) => q.query);

    expect(queries).toEqual(['Excel']);
  });

  it('gắn địa điểm của hồ sơ vào mọi truy vấn', () => {
    for (const query of planFromProfile(ketToan)) {
      expect(query.location).toBe('Ha Noi');
    }
  });

  it('tôn trọng trần số truy vấn', () => {
    const nhieu = profile({
      headline: 'Chuyên viên tuyển dụng',
      targetSectors: ['Ngân hàng', 'Bán lẻ', 'Sản xuất', 'Logistics'],
      primarySkills: ['Sourcing', 'Phỏng vấn', 'Onboarding', 'Employer brand'],
    });

    expect(planFromProfile(nhieu)).toHaveLength(MAX_QUERIES);
  });

  it('bỏ trùng lặp không phân biệt hoa thường', () => {
    const queries = planFromProfile(
      profile({ headline: 'Kế toán', primarySkills: ['kế toán', 'Excel'] }),
    ).map((q) => q.query);

    expect(queries).toEqual(['Kế toán', 'Excel']);
  });

  it('bỏ phần trong ngoặc của chức danh', () => {
    const queries = planFromProfile(
      profile({ headline: 'Kế toán tổng hợp (part-time)' }),
    );

    expect(queries[0].query).toBe('Kế toán tổng hợp');
  });

  it('bỏ qua mục rỗng và mục quá ngắn', () => {
    const queries = planFromProfile(
      profile({ primarySkills: ['  ', 'A', 'Excel'] }),
    ).map((q) => q.query);

    expect(queries).toEqual(['Excel']);
  });
});

/**
 * Gom theo NGÀNH thay vì theo từng hồ sơ: đây là thứ giữ số truy vấn đứng yên
 * khi số người dùng tăng. Bản trước sinh một truy vấn cho mỗi hồ sơ, nên trần
 * truy vấn cắt mất những người xếp sau bảng chữ cái — và không có lỗi nào báo.
 */
describe('clusterProfiles', () => {
  const p = (
    headline: string | null,
    occupationCode: string | null,
    primarySkills: string[] = [],
  ) => ({ headline, primarySkills, occupationCode });

  it('gộp mọi hồ sơ cùng nghề thành MỘT truy vấn', () => {
    const clusters = clusterProfiles([
      p('Kế toán tổng hợp', 'FINANCE'),
      p('Kế toán thuế', 'FINANCE'),
      p('Kế toán tổng hợp', 'FINANCE'),
      p('Điều dưỡng viên', 'HEALTHCARE'),
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({
      clusterCode: 'FIN_ACCOUNTING',
      query: 'Kế toán tổng hợp',
      size: 3,
    });
  });

  it('tách hai NGHỀ trong cùng một nhóm ngành thành hai truy vấn', () => {
    const clusters = clusterProfiles([
      p('Kiểm thử phần mềm', 'IT'),
      p('DevOps Engineer', 'IT'),
      p('Chuyên viên bảo mật', 'IT'),
    ]);

    expect(clusters.map((c) => c.clusterCode).sort()).toEqual([
      'IT_DEVOPS',
      'IT_QA',
      'IT_SECURITY',
    ]);
  });

  it('lùi về mã nhóm khi không suy được nghề cụ thể', () => {
    const clusters = clusterProfiles([p('Nghề lạ chưa có mã', 'OTHER')]);

    expect(clusters[0].clusterCode).toBe('OTHER');
  });

  it('số truy vấn KHÔNG tăng theo số người dùng', () => {
    const many = Array.from({ length: 500 }, (_, index) =>
      p(`Kế toán ${index}`, 'FINANCE'),
    );

    expect(clusterProfiles(many)).toHaveLength(1);
  });

  it('cụm đông người xếp trước', () => {
    const clusters = clusterProfiles([
      p('Điều dưỡng viên', 'HEALTHCARE'),
      p('Kế toán tổng hợp', 'FINANCE'),
      p('Kế toán tổng hợp', 'FINANCE'),
    ]);

    expect(clusters.map((c) => c.clusterCode)).toEqual([
      'FIN_ACCOUNTING',
      'MED_NURSE',
    ]);
  });

  it('lấy chức danh phổ biến nhất trong cụm làm từ khoá', () => {
    const clusters = clusterProfiles([
      p('Kế toán thuế', 'FINANCE'),
      p('Kế toán tổng hợp', 'FINANCE'),
      p('Kế toán tổng hợp', 'FINANCE'),
    ]);

    expect(clusters[0].query).toBe('Kế toán tổng hợp');
  });

  it('từ khoá được làm sạch như mọi truy vấn khác', () => {
    const clusters = clusterProfiles([
      p('Kế toán tổng hợp | 5 năm kinh nghiệm', 'FINANCE'),
    ]);

    expect(clusters[0].query).toBe('Kế toán tổng hợp');
  });

  it('cả cụm không ai có chức danh thì lùi về kỹ năng', () => {
    const clusters = clusterProfiles([
      p(null, 'HEALTHCARE', ['Điều dưỡng', 'Sơ cấp cứu']),
    ]);

    expect(clusters[0].query).toBe('Điều dưỡng');
  });

  it('bỏ qua hồ sơ chưa suy được ngành', () => {
    // Chúng cũng không có chức danh nào dùng làm từ khoá được; giữ lại chỉ tạo
    // một cụm rỗng chiếm mất suất của ngành có thật.
    expect(clusterProfiles([p(null, null), p('  ', null)])).toEqual([]);
  });

  it('không có hồ sơ nào thì không có truy vấn nào', () => {
    expect(clusterProfiles([])).toEqual([]);
  });
});

describe('clusterQuery', () => {
  it('ghi rõ cụm nào và bao nhiêu hồ sơ', () => {
    const query = clusterQuery({
      clusterCode: 'FIN_ACCOUNTING',
      query: 'Kế toán tổng hợp',
      size: 3,
    });

    expect(query.query).toBe('Kế toán tổng hợp');
    expect(query.rationale).toContain('3');
    expect(query.rationale).toContain('FIN_ACCOUNTING');
  });

  it('không lọc tỉnh: lượt quét hệ thống phục vụ mọi địa phương', () => {
    const query = clusterQuery({
      clusterCode: 'IT_BACKEND',
      query: 'Backend Developer',
      size: 1,
    });

    expect(query.location).toBe('');
  });
});

/**
 * Headline thật của người dùng hay kèm phần tự giới thiệu sau dấu gạch đứng.
 * Gửi nguyên câu đó cho portal thì gần như không ra tin nào - đã đo trên lượt
 * quét 17:09, cả 6 từ khoá đều ở dạng này.
 */
describe('làm sạch từ khoá', () => {
  const queryOf = (headline: string) =>
    planFromProfile(profile({ headline }))[0]?.query;

  it('cắt ở dấu gạch đứng, chỉ giữ chức danh', () => {
    expect(queryOf('Kế toán tổng hợp | 5 năm kinh nghiệm')).toBe(
      'Kế toán tổng hợp',
    );
    expect(queryOf('Điều dưỡng viên | Khoa Hồi sức tích cực')).toBe(
      'Điều dưỡng viên',
    );
    expect(queryOf('Kỹ sư cơ khí | Mechanical Engineer')).toBe('Kỹ sư cơ khí');
  });

  it('cắt ở cả dấu chấm giữa và gạch dài', () => {
    expect(queryOf('Nhân viên kinh doanh B2B · Thiết bị công nghiệp')).toBe(
      'Nhân viên kinh doanh B2B',
    );
    expect(queryOf('Backend Developer – Fintech')).toBe('Backend Developer');
  });

  it('bỏ đuôi số năm kinh nghiệm dù không có dấu phân cách', () => {
    expect(queryOf('Backend Developer 5 năm kinh nghiệm')).toBe(
      'Backend Developer',
    );
    expect(queryOf('Kế toán tổng hợp 3+ năm KN')).toBe('Kế toán tổng hợp');
  });

  it('chức danh sạch thì giữ nguyên', () => {
    expect(queryOf('Lập trình viên Full Stack')).toBe(
      'Lập trình viên Full Stack',
    );
    expect(queryOf('Senior React Developer')).toBe('Senior React Developer');
  });

  it('vẫn bỏ phần trong ngoặc như trước', () => {
    expect(queryOf('Kỹ sư cơ khí (nhà máy FDI)')).toBe('Kỹ sư cơ khí');
  });

  it('không còn gì sau khi cắt thì bỏ luôn từ khoá', () => {
    expect(
      planFromProfile(profile({ headline: '| 5 năm kinh nghiệm' })),
    ).toEqual([]);
  });
});

/** Sàn phủ toàn taxonomy: phá vòng "ngành chưa ai có hồ sơ thì cron không bao giờ quét". */
describe('taxonomyBaseline', () => {
  const totalSubOccupations = Object.values(SUB_OCCUPATIONS).flat().length;

  it('phủ đúng một lần cho mọi nghề trong taxonomy', () => {
    const clusters = taxonomyBaseline();
    expect(clusters).toHaveLength(totalSubOccupations);
    expect(new Set(clusters.map((c) => c.clusterCode)).size).toBe(
      totalSubOccupations,
    );
  });

  it('size = 0 để cụm có hồ sơ thật luôn thắng khi tie-break', () => {
    expect(taxonomyBaseline().every((c) => c.size === 0)).toBe(true);
  });

  it('IT và Dữ liệu & AI quét bằng tiếng Anh', () => {
    const clusters = taxonomyBaseline();
    expect(clusters.find((c) => c.clusterCode === 'IT_BACKEND')?.query).toBe(
      'backend',
    );
    expect(clusters.find((c) => c.clusterCode === 'DATA_ANALYST')?.query).toBe(
      'data analyst',
    );
  });

  it('nhóm tiếng Anh vẫn phải là từ tiếng Anh, không lẫn tiếng Việt bỏ dấu', () => {
    // keywords[0] từng là 'nhung' (bỏ dấu của 'nhúng') — không tiếng Anh,
    // cũng không phải tiếng Việt có dấu, nên trả về 0 kết quả trên portal.
    const clusters = taxonomyBaseline();
    expect(clusters.find((c) => c.clusterCode === 'IT_EMBEDDED')?.query).toBe(
      'embedded',
    );
  });

  it('ngành ngoài IT quét bằng tiếng Việt có dấu, không dấu thì portal trả 0 kết quả', () => {
    const clusters = taxonomyBaseline();
    expect(
      clusters.find((c) => c.clusterCode === 'FIN_ACCOUNTING')?.query,
    ).toBe('Kế toán');
    expect(clusters.find((c) => c.clusterCode === 'MAN_WORKER')?.query).toBe(
      'Công nhân',
    );
  });

  it('tên gộp hai khái niệm bằng "/" thì lấy nửa có DẤU tiếng Việt', () => {
    const clusters = taxonomyBaseline();
    expect(clusters.find((c) => c.clusterCode === 'HOS_SERVICE')?.query).toBe(
      'Phục vụ',
    );
    // Bẫy đã sập: cắt nửa ĐẦU vô điều kiện từng chọn "C&B" (biệt ngữ) thay vì
    // nửa tiếng Việt tự nhiên đứng sau dấu "/".
    expect(clusters.find((c) => c.clusterCode === 'HR_CB')?.query).toBe(
      'Nhân sự tổng hợp',
    );
  });

  it('hai nửa cùng không có dấu tiếng Việt thì lấy nửa DÀI hơn', () => {
    const clusters = taxonomyBaseline();
    // "3D" một mình quá chung chung; "Game Art" cụ thể hơn.
    expect(clusters.find((c) => c.clusterCode === 'DESIGN_3D')?.query).toBe(
      'Game Art',
    );
  });

  it('không để nửa DÀI hơn lật một cụm tiếng Việt hợp lệ sang tiếng Anh', () => {
    const clusters = taxonomyBaseline();
    // "Copywriting" dài hơn "Nội dung" nhưng là tiếng Anh — sai ngôn ngữ theo
    // ngành sẽ khiến portal trả về 0 kết quả, không phải kết quả sai.
    expect(clusters.find((c) => c.clusterCode === 'MKT_CONTENT')?.query).toBe(
      'Nội dung',
    );
  });
});

/** Suy ra mã NHÓM cha để lọc portal chỉ phục vụ một số ngành (vd. ITviec chỉ IT). */
describe('occupationGroupOf', () => {
  it('trả về mã nhóm cha của một mã nghề con', () => {
    expect(occupationGroupOf('IT_BACKEND')).toBe('IT');
    expect(occupationGroupOf('FIN_ACCOUNTING')).toBe('FINANCE');
    expect(occupationGroupOf('DATA_ANALYST')).toBe('DATA_AI');
  });

  it('mã đã là mã nhóm (nhánh lùi) thì trả về chính nó', () => {
    expect(occupationGroupOf('FINANCE')).toBe('FINANCE');
    expect(occupationGroupOf('OTHER')).toBe('OTHER');
  });
});
