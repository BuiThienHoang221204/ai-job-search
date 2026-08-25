/**
 * Hồ sơ demo cho các ngành NGOÀI công nghệ thông tin.
 *
 * Đề tài phục vụ mọi ngành, nhưng dữ liệu thử nghiệm cho tới nay chỉ có một hồ
 * sơ backend developer, nên phần lớn đường đi ngoài IT chưa từng được chạy thật.
 * Mỗi persona cố ý chạm một nhánh khác nhau - xem trường `chamVao`.
 */
export const personas = [
  {
    slug: 'ketoan',
    name: 'Trần Thị Bích Ngọc',
    nganh: 'FINANCE — Kế toán / Kiểm toán / Tài chính',
    chamVao:
      'Trường hợp kinh điển: chức danh và kỹ năng đều là tiếng Việt có dấu. ' +
      'Truy vấn quét sinh ra bằng tiếng Anh sẽ trả về 0 tin.',
    headline: 'Kế toán tổng hợp | 5 năm kinh nghiệm',
    location: 'Quận Tân Bình, Hồ Chí Minh',
    phone: '0901000001',
    languages: ['Tiếng Việt'],
    employmentStatus: 'Đang đi làm, sẵn sàng chuyển việc',
    summary:
      'Kế toán tổng hợp 5 năm tại doanh nghiệp thương mại, phụ trách sổ sách, ' +
      'báo cáo thuế và quyết toán năm. Thành thạo MISA và Excel nâng cao.',
    citizenship: 'Việt Nam',
    workPermit: 'Không cần',
    primarySkills: ['Kế toán tổng hợp', 'MISA', 'Excel', 'Báo cáo thuế', 'Quyết toán thuế'],
    secondarySkills: ['SAP', 'Tiếng Anh giao tiếp', 'Fast Accounting'],
    directExperienceDomains: ['Thương mại', 'Bán lẻ'],
    careerGoals: ['Kế toán trưởng'],
    energizingTasks: ['Lập báo cáo tài chính', 'Rà soát và tối ưu quy trình sổ sách'],
    drainingTasks: ['Trực điện thoại khách hàng', 'Công tác tỉnh dài ngày'],
    targetSectors: ['Sản xuất', 'Thương mại', 'Logistics'],
    dealBreakers: ['Không làm thêm giờ thường xuyên'],
    remotePreference: 'Onsite',
    willingToRelocate: false,
    completion: 85,
  },
  {
    slug: 'dieuduong',
    name: 'Phạm Thị Hồng',
    nganh: 'HEALTHCARE — Y tế / Dược',
    chamVao:
      'Nghề buộc có mặt tại chỗ và có chứng chỉ hành nghề: remote luôn phải FAIL, ' +
      'và tin ngoài Đà Nẵng phải bị loại theo ràng buộc đi lại.',
    headline: 'Điều dưỡng viên | Khoa Hồi sức tích cực',
    location: 'Quận Hải Châu, Đà Nẵng',
    phone: '0901000002',
    languages: ['Tiếng Việt'],
    employmentStatus: 'Đang đi làm',
    summary:
      'Điều dưỡng viên 6 năm tại khoa Hồi sức tích cực, có chứng chỉ hành nghề. ' +
      'Quen chăm sóc bệnh nhân nặng và phối hợp trực ca.',
    citizenship: 'Việt Nam',
    workPermit: 'Không cần',
    primarySkills: ['Điều dưỡng', 'Hồi sức cấp cứu', 'Chăm sóc bệnh nhân', 'Chứng chỉ hành nghề'],
    secondarySkills: ['Sơ cấp cứu', 'Quản lý hồ sơ bệnh án'],
    directExperienceDomains: ['Bệnh viện công', 'Hồi sức tích cực'],
    careerGoals: ['Điều dưỡng trưởng'],
    energizingTasks: ['Chăm sóc trực tiếp người bệnh', 'Đào tạo điều dưỡng mới'],
    drainingTasks: ['Trực đêm liên tục', 'Công việc hành chính giấy tờ'],
    targetSectors: ['Bệnh viện', 'Phòng khám đa khoa'],
    dealBreakers: ['Không chuyển khỏi Đà Nẵng'],
    remotePreference: 'Onsite',
    willingToRelocate: false,
    completion: 78,
  },
  {
    slug: 'giaovien',
    name: 'Maria Santos',
    nganh: 'EDUCATION — Giáo dục / Đào tạo',
    chamVao:
      'NGƯỜI NƯỚC NGOÀI cần bảo lãnh giấy phép lao động — đây là hồ sơ duy nhất ' +
      'làm Eligibility Gate trả FAIL, bộ lọc CỨNG chạy trước khi chấm điểm.',
    headline: 'English Teacher | IELTS & Business English',
    location: 'Quận Cầu Giấy, Hà Nội',
    phone: '0901000003',
    languages: ['English', 'Tagalog', 'Tiếng Việt cơ bản'],
    employmentStatus: 'Đang tìm việc',
    summary:
      'English teacher with 7 years in Vietnam teaching IELTS and Business English ' +
      'to adult learners. TESOL certified, currently on a sponsored work permit.',
    citizenship: 'Philippines',
    workPermit: 'Cần công ty bảo lãnh',
    primarySkills: ['English Teaching', 'IELTS', 'Business English', 'TESOL', 'Curriculum Design'],
    secondarySkills: ['Online Teaching', 'Academic Management'],
    directExperienceDomains: ['Trung tâm Anh ngữ', 'Đào tạo doanh nghiệp'],
    careerGoals: ['Academic Manager'],
    energizingTasks: ['Dạy lớp nhỏ', 'Thiết kế giáo trình'],
    drainingTasks: ['Tuyển sinh', 'Dạy lớp trên 30 học viên'],
    targetSectors: ['Giáo dục', 'Trung tâm ngoại ngữ'],
    dealBreakers: ['Không nhận việc không bảo lãnh giấy phép lao động'],
    remotePreference: 'Hybrid',
    willingToRelocate: false,
    completion: 80,
  },
  {
    slug: 'kinhdoanh',
    name: 'Lê Văn Cường',
    nganh: 'SALES — Kinh doanh / Bán hàng',
    chamVao:
      'Lương dạng hoa hồng, không có con số cố định — bộ lọc theo mức lương tối ' +
      'thiểu phải xử lý được tin không công bố lương cứng.',
    headline: 'Nhân viên kinh doanh B2B | Thiết bị công nghiệp',
    location: 'Thủ Dầu Một, Bình Dương',
    phone: '0901000004',
    languages: ['Tiếng Việt', 'English'],
    employmentStatus: 'Đang đi làm, sẵn sàng chuyển việc',
    summary:
      'Nhân viên kinh doanh 4 năm mảng thiết bị công nghiệp, phụ trách khách hàng ' +
      'nhà máy tại Bình Dương và Đồng Nai. Quen quy trình đấu thầu và chăm sóc đại lý.',
    citizenship: 'Việt Nam',
    workPermit: 'Không cần',
    primarySkills: ['Bán hàng B2B', 'Đàm phán', 'Chăm sóc khách hàng', 'Đấu thầu', 'CRM'],
    secondarySkills: ['Tiếng Anh thương mại', 'Excel'],
    directExperienceDomains: ['Thiết bị công nghiệp', 'Khu công nghiệp'],
    careerGoals: ['Trưởng phòng kinh doanh'],
    energizingTasks: ['Gặp khách hàng trực tiếp', 'Chốt hợp đồng lớn'],
    drainingTasks: ['Nhập liệu báo cáo', 'Telesale danh sách lạnh'],
    targetSectors: ['Sản xuất', 'Cơ khí', 'Tự động hoá'],
    dealBreakers: [],
    remotePreference: 'Onsite',
    willingToRelocate: true,
    completion: 72,
  },
  {
    slug: 'xuatnhapkhau',
    name: 'Đỗ Thu Hà',
    nganh: 'LOGISTICS — Logistics / Xuất nhập khẩu',
    chamVao:
      'Tỉnh ngoài hai thành phố lớn: mã tỉnh Hải Phòng phải suy ra được từ ' +
      'chuỗi địa điểm, nếu không hồ sơ này biến mất khỏi bộ lọc theo tỉnh.',
    headline: 'Nhân viên xuất nhập khẩu | Chứng từ & khai báo hải quan',
    location: 'Quận Ngô Quyền, Hải Phòng',
    phone: '0901000005',
    languages: ['Tiếng Việt', 'English', '中文 cơ bản'],
    employmentStatus: 'Đang tìm việc',
    summary:
      'Ba năm làm chứng từ xuất nhập khẩu và khai báo hải quan điện tử tại cảng ' +
      'Hải Phòng. Quen Incoterms, L/C và làm việc với hãng tàu.',
    citizenship: 'Việt Nam',
    workPermit: 'Không cần',
    primarySkills: ['Xuất nhập khẩu', 'Khai báo hải quan', 'ECUS', 'Incoterms', 'Chứng từ'],
    secondarySkills: ['Tiếng Trung', 'Excel', 'Thanh toán L/C'],
    directExperienceDomains: ['Cảng biển', 'Forwarder'],
    careerGoals: ['Trưởng bộ phận chứng từ'],
    energizingTasks: ['Xử lý bộ chứng từ phức tạp', 'Làm việc với hãng tàu'],
    drainingTasks: ['Đi hiện trường ban đêm'],
    targetSectors: ['Logistics', 'Xuất nhập khẩu', 'Sản xuất'],
    dealBreakers: ['Không chuyển vào miền Nam'],
    remotePreference: 'Onsite',
    willingToRelocate: false,
    completion: 76,
  },
  {
    slug: 'cokhi',
    name: 'Hoàng Đức Minh',
    nganh: 'MANUFACTURING — Sản xuất / Cơ khí / Điện',
    chamVao:
      'Chức danh pha trộn Việt - Anh ("Kỹ sư cơ khí / Mechanical Engineer"), ' +
      'kiểu đặt tên rất phổ biến ở khu công nghiệp.',
    headline: 'Kỹ sư cơ khí | Mechanical Engineer',
    location: 'Biên Hoà, Đồng Nai',
    phone: '0901000006',
    languages: ['Tiếng Việt', 'English'],
    employmentStatus: 'Đang đi làm',
    summary:
      'Kỹ sư cơ khí 5 năm tại nhà máy FDI, phụ trách thiết kế khuôn và cải tiến ' +
      'dây chuyền. Sử dụng SolidWorks, AutoCAD và quen chuẩn ISO 9001.',
    citizenship: 'Việt Nam',
    workPermit: 'Không cần',
    primarySkills: ['SolidWorks', 'AutoCAD', 'Thiết kế khuôn', 'Bảo trì máy', 'ISO 9001'],
    secondarySkills: ['Lean Manufacturing', 'Tiếng Anh kỹ thuật', 'PLC cơ bản'],
    directExperienceDomains: ['Nhà máy FDI', 'Cơ khí chính xác'],
    careerGoals: ['Trưởng phòng kỹ thuật'],
    energizingTasks: ['Cải tiến dây chuyền', 'Thiết kế chi tiết máy'],
    drainingTasks: ['Họp dài không ra quyết định'],
    targetSectors: ['Sản xuất', 'Ô tô', 'Điện tử'],
    dealBreakers: [],
    remotePreference: 'Onsite',
    willingToRelocate: true,
    completion: 74,
  },
  {
    slug: 'mkt-fresher',
    name: 'Vũ Khánh Linh',
    nganh: 'MARKETING — Marketing / PR / Quảng cáo',
    chamVao:
      'CỐ Ý SƠ SÀI: completion 25, dưới ngưỡng MIN_COMPLETION_TO_SCORE = 30. ' +
      'Hồ sơ này PHẢI bị bỏ qua khi quạt việc chấm điểm — dùng để kiểm nhánh đó.',
    headline: 'Sinh viên mới tốt nghiệp ngành Marketing',
    location: 'Hà Nội',
    phone: null,
    languages: ['Tiếng Việt'],
    employmentStatus: 'Sinh viên mới tốt nghiệp',
    summary: null,
    citizenship: 'Việt Nam',
    workPermit: 'Không cần',
    primarySkills: ['Facebook Ads'],
    secondarySkills: [],
    directExperienceDomains: [],
    careerGoals: [],
    energizingTasks: [],
    drainingTasks: [],
    targetSectors: [],
    dealBreakers: [],
    remotePreference: null,
    willingToRelocate: true,
    completion: 25,
  },
];
