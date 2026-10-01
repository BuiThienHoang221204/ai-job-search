/** Phẳng một tầng, cố ý không phân cấp. THỨ TỰ CÓ NGHĨA: mục đứng trước thắng khi một tin khớp nhiều nhóm. */
export interface Occupation {
  code: string;
  name: string;
  keywords: string[];
}

export const OCCUPATIONS: Occupation[] = [
  {
    code: 'DATA_AI',
    name: 'Dữ liệu & AI',
    keywords: [
      'data analyst',
      'data engineer',
      'data scientist',
      'phan tich du lieu',
      'khoa hoc du lieu',
      'machine learning',
      'deep learning',
      'artificial intelligence',
      'tri tue nhan tao',
      'business intelligence',
      'bi developer',
      'computer vision',
      'ai engineer',
      'ml engineer',
    ],
  },
  {
    code: 'IT',
    name: 'Công nghệ thông tin',
    keywords: [
      'developer',
      'lap trinh',
      'ky su phan mem',
      'software',
      'backend',
      'frontend',
      'fullstack',
      'full stack',
      'devops',
      'mobile',
      'android',
      'react',
      'angular',
      'nodejs',
      'node js',
      'java',
      'python',
      'php',
      'golang',
      'dotnet',
      'tester',
      'kiem thu',
      'it support',
      'helpdesk',
      'quan tri he thong',
      'blockchain',
      'nhung',
      'embedded',
      'an toan thong tin',
      'bao mat',
      'devops',
      'site reliability',
      'hardware engineer',
      'back end',
      'security engineer',
      'network engineer',
      'technical support',
      'sap',
      'database',
      'cloud',
      'platform engineer',
      'quan tri mang',
      'enterprise applications',
      'enterprise data',
    ],
    // 'engineer' trần đã gỡ 2026-10-01: khớp cả Mechanical/Facilities/HVAC Engineer (113/612 tin IT đo được), không riêng phần mềm. Cụm ghép ở trên là để vớt lại các vai trò IT thật (Site Reliability, Embedded, Hardware...) không còn khớp từ khoá chung nào khác.
  },
  {
    code: 'DESIGN',
    name: 'Thiết kế & Sáng tạo',
    keywords: [
      'designer',
      'ui ux',
      'graphic',
      'do hoa',
      'motion',
      'illustrator',
      'dung phim',
      'editor video',
      'sang tao noi dung',
      'content creator',
      'nhiep anh',
      '3d artist',
      'thiet ke website',
      'game artist',
      '2d artist',
      'character artist',
      'environment modeler',
    ],
    // 'thiet ke' trần đã gỡ 2026-10-01: khớp cả "Kỹ Sư Thiết Kế Cơ Khí" (11 tin đo được), không riêng thiết kế sáng tạo.
  },
  {
    code: 'MARKETING',
    name: 'Marketing / PR / Quảng cáo',
    keywords: [
      'marketing',
      'truyen thong',
      'quang cao',
      'social media',
      'noi dung',
      'quan he cong chung',
      'thuong hieu',
      'copywriter',
      'media planner',
    ],
  },
  {
    code: 'SALES',
    name: 'Kinh doanh / Bán hàng',
    keywords: [
      'kinh doanh',
      'ban hang',
      'sales',
      'business development',
      'phat trien kinh doanh',
      'account manager',
      'telesales',
      'tu van ban hang',
      'bat dong san',
      'moi gioi',
    ],
  },
  {
    code: 'CUSTOMER',
    name: 'Chăm sóc khách hàng',
    keywords: [
      'cham soc khach hang',
      'customer service',
      'customer support',
      'customer success',
      'tong dai',
      'call center',
      'ho tro khach hang',
      'le tan',
      'receptionist',
    ],
  },
  {
    code: 'FINANCE',
    name: 'Kế toán / Kiểm toán / Tài chính',
    keywords: [
      'ke toan',
      'accountant',
      'kiem toan',
      'audit',
      'tai chinh',
      'finance',
      'thue',
      'ngan hang',
      'banking',
      'tin dung',
      'dau tu',
      'investment',
      'chung khoan',
      'bao hiem',
      'insurance',
      'kiem soat noi bo',
    ],
  },
  {
    code: 'HR',
    name: 'Nhân sự / Hành chính / Pháp chế',
    keywords: [
      'nhan su',
      'human resource',
      'tuyen dung',
      'recruiter',
      'talent acquisition',
      'hanh chinh',
      'thu ky',
      'phap che',
      'phap ly',
      'legal',
      'luat su',
      'hr',
      'human resources',
      'hrbp',
      'workforce',
      'people partner',
    ],
    // 'tro ly' trần đã gỡ 2026-10-01: khớp "trợ lý" của mọi ngành (trợ lý kho, trợ lý sale logistics...), không riêng HR.
  },
  {
    code: 'MANUFACTURING',
    name: 'Sản xuất / Cơ khí / Điện',
    keywords: [
      'san xuat',
      'production',
      'manufacturing',
      'co khi',
      'mechanical',
      'dien tu',
      'electronic',
      'ky su dien',
      'tu dong hoa',
      'automation',
      'bao tri',
      'maintenance',
      'van hanh may',
      'cong nghiep',
    ],
  },
  {
    code: 'CONSTRUCTION',
    name: 'Xây dựng / Kiến trúc',
    keywords: [
      'xay dung',
      'construction',
      'kien truc',
      'architect',
      'giam sat cong trinh',
      'du toan',
      'thiet ke noi that',
      'civil engineer',
      'chi huy truong',
      'ha tang',
    ],
  },
  {
    code: 'LOGISTICS',
    name: 'Logistics / Xuất nhập khẩu',
    keywords: [
      'logistics',
      'xuat nhap khau',
      'chuoi cung ung',
      'supply chain',
      'kho van',
      'warehouse',
      'thu mua',
      'purchasing',
      'procurement',
      'giao nhan',
      'forwarder',
      'hai quan',
      'van tai',
      'export',
      'import',
      'customs',
      'clearance',
    ],
  },
  {
    code: 'HEALTHCARE',
    name: 'Y tế / Dược',
    keywords: [
      'bac si',
      'doctor',
      'y ta',
      'nurse',
      'dieu duong',
      'duoc si',
      'pharmacist',
      'trinh duoc vien',
      'y te',
      'healthcare',
      'xet nghiem',
      'nha khoa',
      'phuc hoi chuc nang',
      'medical',
      'y si',
      'phong kham',
      'clinic',
      'physical therapist',
      'patient',
      'tu van suc khoe',
    ],
  },
  {
    code: 'EDUCATION',
    name: 'Giáo dục / Đào tạo',
    keywords: [
      'giao vien',
      'teacher',
      'giang vien',
      'lecturer',
      'gia su',
      'tutor',
      'dao tao',
      'training',
      'giao duc',
      'education',
      'tro giang',
      'tu van du hoc',
      'trainer',
      'esl',
      'ielts',
      'teaching',
      'hoc vu',
    ],
  },
  {
    code: 'HOSPITALITY',
    name: 'Nhà hàng / Khách sạn / Du lịch',
    keywords: [
      'nha hang',
      'khach san',
      'hotel',
      'restaurant',
      'du lich',
      'tourism',
      'dau bep',
      'phuc vu',
      'waiter',
      'barista',
      'bartender',
      'buong phong',
      'huong dan vien',
      'lu hanh',
      'spa',
      'wellness',
    ],
  },
  {
    code: 'RETAIL',
    name: 'Bán lẻ / Thương mại điện tử',
    keywords: [
      'ban le',
      'retail',
      'sieu thi',
      'cua hang truong',
      'store manager',
      'thuong mai dien tu',
      'ecommerce',
      'san thuong mai',
      'merchandiser',
    ],
  },
  {
    code: 'AGRICULTURE',
    name: 'Nông / Lâm / Ngư nghiệp',
    keywords: [
      'nong nghiep',
      'agriculture',
      'chan nuoi',
      'thuy san',
      'trong trot',
      'lam nghiep',
      'thu y',
      'nong hoc',
    ],
  },
  {
    code: 'MANUAL',
    name: 'Lao động phổ thông',
    keywords: [
      'lao dong pho thong',
      'cong nhan',
      'tap vu',
      'bao ve',
      'security guard',
      'tai xe',
      'lai xe',
      'driver',
      'giao hang',
      'shipper',
      'boc xep',
      've sinh cong nghiep',
      'phu kho',
    ],
  },
  {
    code: 'OTHER',
    name: 'Ngành nghề khác',
    keywords: [],
  },
];

/** Mã dùng khi không suy ra được nhóm nào. */
export const OTHER_CODE = 'OTHER';

const OTHER_SUB_SUFFIX = '_OTHER';

/** Mã giả "nghề con chưa xác định" của một nhóm — chỉ dùng ở cột lọc, không phải mã thật trong `SUB_OCCUPATIONS`. */
export function otherSubCodeOf(occupationCode: string): string {
  return `${occupationCode}${OTHER_SUB_SUFFIX}`;
}

/** Trả về mã nhóm cha nếu `code` là mã giả "Khác" của nhóm đó, ngược lại `null`. */
export function parentOfOtherSubCode(code: string): string | null {
  if (!code.endsWith(OTHER_SUB_SUFFIX)) return null;
  const parent = code.slice(0, -OTHER_SUB_SUFFIX.length);
  return OCCUPATIONS.some((occupation) => occupation.code === parent)
    ? parent
    : null;
}

/** Nhóm gần đến mức một hồ sơ nhóm này thường ứng tuyển được tin nhóm kia. Quan hệ hai chiều, khai một lần. */
const ADJACENT_OCCUPATIONS: ReadonlyArray<readonly [string, string]> = [
  ['IT', 'DATA_AI'],
];

/** Mã nhóm được coi là "cùng ngành" với hồ sơ: chính nó, nhóm liền kề, và `OTHER` vì tin chưa phân loại được thì không có căn cứ để loại. */
export function nearbyOccupations(code: string): string[] {
  const near = new Set([code, OTHER_CODE]);
  for (const [left, right] of ADJACENT_OCCUPATIONS) {
    if (left === code) near.add(right);
    if (right === code) near.add(left);
  }
  return [...near];
}

/** Cùng quan hệ `nearbyOccupations` dưới dạng hai mảng song song, để SQL `unnest` tra theo cặp (ngành hồ sơ, ngành tin). */
export function nearbyOccupationPairs(): { profile: string[]; job: string[] } {
  const profile: string[] = [];
  const job: string[] = [];
  for (const { code } of OCCUPATIONS) {
    for (const near of nearbyOccupations(code)) {
      profile.push(code);
      job.push(near);
    }
  }
  return { profile, job };
}
