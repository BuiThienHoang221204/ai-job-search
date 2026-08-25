export interface SubOccupation {
  code: string;
  name: string;
  keywords: string[];
}

export const SUB_OCCUPATIONS: Record<string, SubOccupation[]> = {
  IT: [
    {
      code: 'IT_QA',
      name: 'Kiểm thử / QA',
      keywords: [
        'tester',
        'kiem thu',
        'qa engineer',
        'qc engineer',
        'automation test',
        'manual test',
      ],
    },
    {
      code: 'IT_DEVOPS',
      name: 'DevOps / Hạ tầng',
      keywords: [
        'devops',
        'sre',
        'cloud engineer',
        'ha tang',
        'quan tri he thong',
        'system admin',
        'kubernetes',
      ],
    },
    {
      code: 'IT_SECURITY',
      name: 'An toàn thông tin',
      keywords: [
        'security',
        'an toan thong tin',
        'bao mat',
        'pentest',
        'soc analyst',
      ],
    },
    {
      code: 'IT_SUPPORT',
      name: 'IT Support / Helpdesk',
      keywords: ['it support', 'helpdesk', 'ho tro ky thuat', 'it helpdesk'],
    },
    {
      code: 'IT_EMBEDDED',
      name: 'Nhúng / IoT',
      keywords: ['nhung', 'embedded', 'iot', 'firmware', 'vi dieu khien'],
    },
    {
      code: 'IT_PM',
      name: 'Quản lý dự án / BA',
      keywords: [
        'business analyst',
        'product owner',
        'scrum master',
        'quan ly du an',
        'project manager',
      ],
    },
    {
      code: 'IT_MOBILE',
      name: 'Lập trình di động',
      keywords: [
        'mobile developer',
        'android',
        'ios developer',
        'flutter',
        'react native',
      ],
    },
    {
      code: 'IT_FULLSTACK',
      name: 'Fullstack',
      keywords: ['fullstack', 'full stack', 'full-stack'],
    },
    {
      code: 'IT_BACKEND',
      name: 'Backend',
      keywords: [
        'backend',
        'back end',
        'back-end',
        'nodejs',
        'node js',
        'java developer',
        'php',
        'golang',
        'dotnet',
        '.net developer',
        'python developer',
        'api developer',
      ],
    },
    {
      code: 'IT_FRONTEND',
      name: 'Frontend',
      keywords: [
        'frontend',
        'front end',
        'front-end',
        'reactjs',
        'react developer',
        'vuejs',
        'angular developer',
        'web developer',
      ],
    },
    {
      code: 'IT_SWE',
      name: 'Lập trình phần mềm',
      keywords: [
        'developer',
        'lap trinh',
        'ky su phan mem',
        'software engineer',
      ],
    },
  ],

  DATA_AI: [
    {
      code: 'DATA_ANALYST',
      name: 'Phân tích dữ liệu',
      keywords: [
        'data analyst',
        'phan tich du lieu',
        'business intelligence',
        'bi developer',
      ],
    },
    {
      code: 'DATA_ENGINEER',
      name: 'Kỹ sư dữ liệu',
      keywords: ['data engineer', 'ky su du lieu', 'etl', 'data pipeline'],
    },
    {
      code: 'DATA_SCIENCE',
      name: 'Khoa học dữ liệu / ML',
      keywords: [
        'data scientist',
        'khoa hoc du lieu',
        'machine learning',
        'deep learning',
        'computer vision',
      ],
    },
  ],

  DESIGN: [
    {
      code: 'DESIGN_UIUX',
      name: 'UI/UX',
      keywords: ['ui ux', 'ux designer', 'ui designer', 'product designer'],
    },
    {
      code: 'DESIGN_GRAPHIC',
      name: 'Thiết kế đồ hoạ',
      keywords: ['graphic', 'do hoa', 'illustrator', 'thiet ke an pham'],
    },
    {
      code: 'DESIGN_VIDEO',
      name: 'Video / Motion',
      keywords: ['motion', 'dung phim', 'editor video', 'quay dung'],
    },
    {
      code: 'DESIGN_3D',
      name: '3D / Game Art',
      keywords: ['3d artist', 'game artist', 'modeling'],
    },
  ],

  MARKETING: [
    {
      code: 'MKT_DIGITAL',
      name: 'Digital Marketing',
      keywords: [
        'digital marketing',
        'performance marketing',
        'google ads',
        'facebook ads',
        'seo',
      ],
    },
    {
      code: 'MKT_CONTENT',
      name: 'Nội dung / Copywriting',
      keywords: ['content', 'copywriter', 'noi dung', 'bien tap'],
    },
    {
      code: 'MKT_BRAND',
      name: 'Thương hiệu / PR',
      keywords: [
        'thuong hieu',
        'brand',
        'quan he cong chung',
        'truyen thong',
        'pr executive',
      ],
    },
    {
      code: 'MKT_SOCIAL',
      name: 'Social Media',
      keywords: ['social media', 'community', 'tiktok', 'fanpage'],
    },
  ],

  SALES: [
    {
      code: 'SALES_B2B',
      name: 'Kinh doanh B2B / Dự án',
      keywords: [
        'business development',
        'phat trien kinh doanh',
        'account manager',
        'sales b2b',
        'kinh doanh du an',
      ],
    },
    {
      code: 'SALES_TELE',
      name: 'Telesales',
      keywords: [
        'telesales',
        'tu van qua dien thoai',
        'ban hang qua dien thoai',
      ],
    },
    {
      code: 'SALES_REALESTATE',
      name: 'Bất động sản',
      keywords: ['bat dong san', 'moi gioi', 'chuyen vien kinh doanh bds'],
    },
    {
      code: 'SALES_FIELD',
      name: 'Kinh doanh thị trường',
      keywords: [
        'nhan vien kinh doanh',
        'sales executive',
        'thi truong',
        'ban hang',
      ],
    },
  ],

  CUSTOMER: [
    {
      code: 'CS_CARE',
      name: 'Chăm sóc khách hàng',
      keywords: [
        'cham soc khach hang',
        'customer service',
        'customer success',
        'ho tro khach hang',
      ],
    },
    {
      code: 'CS_CALL',
      name: 'Tổng đài / Call center',
      keywords: ['tong dai', 'call center', 'dien thoai vien'],
    },
    {
      code: 'CS_RECEPTION',
      name: 'Lễ tân',
      keywords: ['le tan', 'receptionist'],
    },
  ],

  FINANCE: [
    {
      code: 'FIN_ACCOUNTING',
      name: 'Kế toán',
      keywords: ['ke toan', 'accountant', 'ke toan tong hop', 'ke toan kho'],
    },
    {
      code: 'FIN_AUDIT',
      name: 'Kiểm toán',
      keywords: ['kiem toan', 'auditor', 'kiem soat noi bo'],
    },
    {
      code: 'FIN_TAX',
      name: 'Thuế',
      keywords: ['thue', 'tax', 'quyet toan thue'],
    },
    {
      code: 'FIN_BANKING',
      name: 'Ngân hàng',
      keywords: [
        'ngan hang',
        'tin dung',
        'giao dich vien',
        'quan he khach hang',
      ],
    },
    {
      code: 'FIN_INVEST',
      name: 'Tài chính / Đầu tư',
      keywords: ['tai chinh', 'dau tu', 'phan tich tai chinh', 'chung khoan'],
    },
    {
      code: 'FIN_INSURANCE',
      name: 'Bảo hiểm',
      keywords: ['bao hiem', 'insurance'],
    },
  ],

  HR: [
    {
      code: 'HR_RECRUIT',
      name: 'Tuyển dụng',
      keywords: ['tuyen dung', 'recruiter', 'talent acquisition'],
    },
    {
      code: 'HR_CB',
      name: 'C&B / Nhân sự tổng hợp',
      keywords: [
        'c b',
        'tien luong',
        'bao hiem xa hoi',
        'nhan su tong hop',
        'hr admin',
      ],
    },
    {
      code: 'HR_ADMIN',
      name: 'Hành chính',
      keywords: ['hanh chinh', 'admin officer', 'van phong'],
    },
    {
      code: 'HR_LEGAL',
      name: 'Pháp chế',
      keywords: ['phap che', 'phap ly', 'legal', 'luat su'],
    },
  ],

  MANUFACTURING: [
    {
      code: 'MFG_MECHANICAL',
      name: 'Cơ khí',
      keywords: ['co khi', 'mechanical', 'gia cong', 'cnc', 'khuon mau'],
    },
    {
      code: 'MFG_ELECTRICAL',
      name: 'Điện / Điện tử',
      keywords: ['dien tu', 'ky su dien', 'electrical', 'tu dong hoa', 'plc'],
    },
    {
      code: 'MFG_QAQC',
      name: 'QA/QC sản xuất',
      keywords: [
        'qa qc',
        'kiem tra chat luong',
        'quality control',
        'quality assurance',
      ],
    },
    {
      code: 'MFG_OPERATOR',
      name: 'Vận hành máy',
      keywords: ['van hanh may', 'operator', 'to truong san xuat'],
    },
    {
      code: 'MFG_SAFETY',
      name: 'An toàn lao động / HSE',
      keywords: ['an toan lao dong', 'hse', 'moi truong'],
    },
  ],

  CONSTRUCTION: [
    {
      code: 'CON_ARCHITECT',
      name: 'Kiến trúc',
      keywords: ['kien truc', 'architect', 'noi that'],
    },
    {
      code: 'CON_CIVIL',
      name: 'Kỹ sư xây dựng',
      keywords: ['ky su xay dung', 'civil engineer', 'ket cau'],
    },
    {
      code: 'CON_SUPERVISOR',
      name: 'Giám sát công trình',
      keywords: ['giam sat', 'chi huy truong', 'cong truong'],
    },
    {
      code: 'CON_QS',
      name: 'Dự toán / QS',
      keywords: ['du toan', 'quantity surveyor', 'boc tach khoi luong'],
    },
    {
      code: 'CON_ME',
      name: 'Cơ điện M&E',
      keywords: ['m e', 'co dien', 'mep'],
    },
  ],

  LOGISTICS: [
    {
      code: 'LOG_IMPEXP',
      name: 'Xuất nhập khẩu',
      keywords: [
        'xuat nhap khau',
        'import export',
        'chung tu',
        'khai bao hai quan',
      ],
    },
    {
      code: 'LOG_WAREHOUSE',
      name: 'Kho vận',
      keywords: ['thu kho', 'quan ly kho', 'warehouse', 'kho van'],
    },
    {
      code: 'LOG_TRANSPORT',
      name: 'Vận tải / Giao nhận',
      keywords: ['van tai', 'giao nhan', 'forwarder', 'dieu van'],
    },
    {
      code: 'LOG_PURCHASE',
      name: 'Mua hàng / Chuỗi cung ứng',
      keywords: ['mua hang', 'purchasing', 'supply chain', 'chuoi cung ung'],
    },
  ],

  HEALTHCARE: [
    {
      code: 'MED_DOCTOR',
      name: 'Bác sĩ',
      keywords: ['bac si', 'doctor', 'nha si'],
    },
    {
      code: 'MED_NURSE',
      name: 'Điều dưỡng / Y tá',
      keywords: ['dieu duong', 'y ta', 'ho sinh', 'y si', 'nurse'],
    },
    {
      code: 'MED_PHARMACY',
      name: 'Dược',
      keywords: ['duoc si', 'trinh duoc vien', 'pharmacist', 'nha thuoc'],
    },
    {
      code: 'MED_TECH',
      name: 'Kỹ thuật viên y tế',
      keywords: ['ky thuat vien', 'xet nghiem', 'chan doan hinh anh'],
    },
  ],

  EDUCATION: [
    {
      code: 'EDU_TEACHER',
      name: 'Giáo viên',
      keywords: ['giao vien', 'teacher', 'giang vien', 'gia su'],
    },
    {
      code: 'EDU_ASSISTANT',
      name: 'Trợ giảng',
      keywords: ['tro giang', 'teaching assistant'],
    },
    {
      code: 'EDU_ADMISSION',
      name: 'Tư vấn tuyển sinh',
      keywords: ['tuyen sinh', 'tu van khoa hoc', 'tu van giao duc'],
    },
    {
      code: 'EDU_TRAINING',
      name: 'Quản lý đào tạo',
      keywords: ['quan ly dao tao', 'training manager', 'hoc vu'],
    },
  ],

  HOSPITALITY: [
    {
      code: 'HOS_KITCHEN',
      name: 'Bếp',
      keywords: ['dau bep', 'phu bep', 'bep truong', 'chef'],
    },
    {
      code: 'HOS_SERVICE',
      name: 'Phục vụ / Bar',
      keywords: ['phuc vu', 'bartender', 'barista', 'thu ngan nha hang'],
    },
    {
      code: 'HOS_HOTEL',
      name: 'Khách sạn',
      keywords: [
        'khach san',
        'buong phong',
        'housekeeping',
        'le tan khach san',
      ],
    },
    {
      code: 'HOS_TOUR',
      name: 'Du lịch / Tour',
      keywords: ['huong dan vien', 'dieu hanh tour', 'du lich'],
    },
  ],

  RETAIL: [
    {
      code: 'RET_STORE',
      name: 'Nhân viên cửa hàng',
      keywords: ['nhan vien ban hang', 'cua hang', 'shop', 'thu ngan'],
    },
    {
      code: 'RET_ECOM',
      name: 'Thương mại điện tử',
      keywords: [
        'thuong mai dien tu',
        'ecommerce',
        'san tmdt',
        'shopee',
        'lazada',
      ],
    },
    {
      code: 'RET_MANAGER',
      name: 'Quản lý cửa hàng',
      keywords: ['quan ly cua hang', 'store manager', 'giam sat vung'],
    },
  ],

  AGRICULTURE: [
    {
      code: 'AGR_CROP',
      name: 'Trồng trọt',
      keywords: ['trong trot', 'nong nghiep', 'ky su nong nghiep'],
    },
    {
      code: 'AGR_LIVESTOCK',
      name: 'Chăn nuôi / Thú y',
      keywords: ['chan nuoi', 'thu y', 'trai heo', 'trai ga'],
    },
    {
      code: 'AGR_AQUA',
      name: 'Thuỷ sản',
      keywords: ['thuy san', 'nuoi trong thuy san', 'che bien thuy san'],
    },
  ],

  MANUAL: [
    {
      code: 'MAN_WORKER',
      name: 'Công nhân',
      keywords: ['cong nhan', 'lao dong pho thong', 'thoi vu'],
    },
    {
      code: 'MAN_DRIVER',
      name: 'Lái xe',
      keywords: ['lai xe', 'tai xe', 'driver'],
    },
    {
      code: 'MAN_DELIVERY',
      name: 'Giao hàng',
      keywords: ['giao hang', 'shipper', 'giao nhan hang'],
    },
    {
      code: 'MAN_SECURITY',
      name: 'Bảo vệ',
      keywords: ['bao ve', 'security guard'],
    },
    {
      code: 'MAN_CLEANING',
      name: 'Tạp vụ / Vệ sinh',
      keywords: ['tap vu', 've sinh cong nghiep', 'lao cong'],
    },
  ],
};

export const SUB_OCCUPATION_PARENT: Record<string, string> = Object.fromEntries(
  Object.entries(SUB_OCCUPATIONS).flatMap(([parent, subs]) =>
    subs.map((sub) => [sub.code, parent]),
  ),
);
