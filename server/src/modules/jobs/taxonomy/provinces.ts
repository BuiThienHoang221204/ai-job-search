/**
 * Danh mục 34 tỉnh/thành sau lần sáp nhập có hiệu lực 1/7/2025.
 *
 * `aliases` là những cách viết THẬT gặp trong dữ liệu portal, không phải cách
 * viết đúng chuẩn: tin từ TopCV ghi "TP.HCM", tin từ LinkedIn ghi
 * "Ho Chi Minh City", tin nhập tay ghi "Quận 1, Hồ Chí Minh". Cả ba phải rơi
 * vào cùng một mã, nếu không thì bộ lọc chia một tỉnh thành ba.
 *
 * Tên tỉnh cũ đã sáp nhập cũng nằm trong `aliases` chứ không bị xoá: dữ liệu đã
 * quét trước đó vẫn ghi tên cũ, và người dùng vẫn gõ tên cũ.
 */
export interface Province {
  code: string;
  name: string;
  aliases: string[];
}

export const PROVINCES: Province[] = [
  { code: 'HN', name: 'Hà Nội', aliases: ['ha noi', 'hanoi', 'hn', 'thu do'] },
  {
    code: 'HCM',
    name: 'TP. Hồ Chí Minh',
    aliases: [
      'ho chi minh',
      'hochiminh',
      'tphcm',
      'tp hcm',
      'hcm',
      'sai gon',
      'saigon',
      'binh duong',
      'ba ria',
      'vung tau',
      'ba ria vung tau',
    ],
  },
  {
    code: 'HP',
    name: 'Hải Phòng',
    aliases: ['hai phong', 'haiphong', 'hp', 'hai duong'],
  },
  { code: 'DN', name: 'Đà Nẵng', aliases: ['da nang', 'danang', 'quang nam'] },
  {
    code: 'CT',
    name: 'Cần Thơ',
    aliases: ['can tho', 'hau giang', 'soc trang'],
  },
  {
    code: 'HUE',
    name: 'Huế',
    aliases: ['hue', 'thua thien hue', 'thua thien'],
  },
  { code: 'LC', name: 'Lai Châu', aliases: ['lai chau'] },
  { code: 'DB', name: 'Điện Biên', aliases: ['dien bien'] },
  { code: 'SL', name: 'Sơn La', aliases: ['son la'] },
  { code: 'LS', name: 'Lạng Sơn', aliases: ['lang son'] },
  { code: 'QN', name: 'Quảng Ninh', aliases: ['quang ninh', 'ha long'] },
  { code: 'TN', name: 'Thanh Hóa', aliases: ['thanh hoa'] },
  { code: 'NA', name: 'Nghệ An', aliases: ['nghe an', 'vinh'] },
  { code: 'HT', name: 'Hà Tĩnh', aliases: ['ha tinh'] },
  { code: 'CB', name: 'Cao Bằng', aliases: ['cao bang'] },
  { code: 'TQ', name: 'Tuyên Quang', aliases: ['tuyen quang', 'ha giang'] },
  { code: 'LCA', name: 'Lào Cai', aliases: ['lao cai', 'yen bai'] },
  { code: 'TNG', name: 'Thái Nguyên', aliases: ['thai nguyen', 'bac kan'] },
  {
    code: 'PT',
    name: 'Phú Thọ',
    aliases: ['phu tho', 'vinh phuc', 'hoa binh'],
  },
  { code: 'BN', name: 'Bắc Ninh', aliases: ['bac ninh', 'bac giang'] },
  { code: 'HY', name: 'Hưng Yên', aliases: ['hung yen', 'thai binh'] },
  {
    code: 'NB',
    name: 'Ninh Bình',
    aliases: ['ninh binh', 'nam dinh', 'ha nam'],
  },
  { code: 'QT', name: 'Quảng Trị', aliases: ['quang tri', 'quang binh'] },
  { code: 'QNG', name: 'Quảng Ngãi', aliases: ['quang ngai', 'kon tum'] },
  {
    code: 'GL',
    name: 'Gia Lai',
    aliases: ['gia lai', 'binh dinh', 'quy nhon'],
  },
  {
    code: 'DL',
    name: 'Đắk Lắk',
    aliases: ['dak lak', 'daklak', 'phu yen', 'buon ma thuot'],
  },
  {
    code: 'KH',
    name: 'Khánh Hòa',
    aliases: ['khanh hoa', 'nha trang', 'ninh thuan'],
  },
  {
    code: 'LD',
    name: 'Lâm Đồng',
    aliases: [
      'lam dong',
      'da lat',
      'dalat',
      'dak nong',
      'binh thuan',
      'phan thiet',
    ],
  },
  {
    code: 'DNA',
    name: 'Đồng Nai',
    aliases: ['dong nai', 'bien hoa', 'binh phuoc'],
  },
  { code: 'TNH', name: 'Tây Ninh', aliases: ['tay ninh', 'long an'] },
  {
    code: 'DT',
    name: 'Đồng Tháp',
    aliases: ['dong thap', 'tien giang', 'my tho'],
  },
  {
    code: 'VL',
    name: 'Vĩnh Long',
    aliases: ['vinh long', 'ben tre', 'tra vinh'],
  },
  {
    code: 'AG',
    name: 'An Giang',
    aliases: ['an giang', 'kien giang', 'long xuyen', 'rach gia', 'phu quoc'],
  },
  { code: 'CM', name: 'Cà Mau', aliases: ['ca mau', 'bac lieu'] },
];

/** Làm việc ở nước ngoài hoặc từ xa không gắn tỉnh nào. */
export const REMOTE_CODE = 'REMOTE';
