import { BadRequestException, type ValidationError } from '@nestjs/common';

export const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Mật khẩu',
  name: 'Họ tên',
  headline: 'Chức danh',
  summary: 'Giới thiệu bản thân',
  location: 'Địa điểm',
  phone: 'Số điện thoại',
  country: 'Quốc gia',
  citizenship: 'Quốc tịch',
  workPermit: 'Giấy phép lao động',
  workPermitNote: 'Ghi chú giấy phép lao động',
  employmentStatus: 'Tình trạng việc làm',
  remotePreference: 'Ưu tiên làm việc từ xa',
  commuteConstraint: 'Ràng buộc đi lại',
  willingToRelocate: 'Sẵn sàng chuyển nơi ở',
  currentSalary: 'Lương hiện tại',
  expectedSalary: 'Lương mong muốn',
  languages: 'Ngôn ngữ',
  primarySkills: 'Kỹ năng chính',
  secondarySkills: 'Kỹ năng phụ',
  lackingSkills: 'Kỹ năng còn thiếu',
  directExperienceDomains: 'Lĩnh vực đã làm',
  adjacentExperience: 'Kinh nghiệm liên quan',
  careerGoals: 'Mục tiêu nghề nghiệp',
  energizingTasks: 'Công việc tạo hứng thú',
  drainingTasks: 'Công việc gây chán nản',
  targetSectors: 'Ngành mục tiêu',
  dealBreakers: 'Điều không chấp nhận',
  experiences: 'Kinh nghiệm làm việc',
  projects: 'Dự án',
  educations: 'Học vấn',
  certificates: 'Chứng chỉ',
  behavioralTraits: 'Đặc điểm hành vi',
  title: 'Tiêu đề',
  company: 'Công ty',
  description: 'Mô tả',
  url: 'Đường dẫn',
  jobId: 'Công việc',
  status: 'Trạng thái',
  note: 'Ghi chú',
  limit: 'Số dòng mỗi trang',
  offset: 'Vị trí bắt đầu',
  q: 'Từ khoá tìm kiếm',
};

const number = (value: string): string => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('vi-VN') : value;
};

const RULES: Array<[RegExp, (groups: string[]) => string]> = [
  [
    /^must not be greater than (.+)$/,
    ([max]) => `không được lớn hơn ${number(max)}`,
  ],
  [
    /^must not be less than (.+)$/,
    ([min]) => `không được nhỏ hơn ${number(min)}`,
  ],
  [
    /^must be shorter than or equal to (\d+) characters$/,
    ([max]) => `không được dài quá ${number(max)} ký tự`,
  ],
  [
    /^must be longer than or equal to (\d+) characters$/,
    ([min]) => `phải có ít nhất ${number(min)} ký tự`,
  ],
  [
    /^must contain not more than (\d+) elements$/,
    ([max]) => `không được có quá ${number(max)} mục`,
  ],
  [
    /^must contain at least (\d+) elements$/,
    ([min]) => `phải có ít nhất ${number(min)} mục`,
  ],
  [/^must be an integer number$/, () => 'phải là số nguyên'],
  [
    /^must be a number conforming to the specified constraints$/,
    () => 'phải là một số',
  ],
  [/^must be a string$/, () => 'phải là chuỗi ký tự'],
  [/^must be a boolean value$/, () => 'phải là đúng hoặc sai'],
  [/^must be an array$/, () => 'phải là một danh sách'],
  [/^must be an email$/, () => 'không đúng định dạng email'],
  [/^must be a URL address$/, () => 'không đúng định dạng đường dẫn'],
  [/^must be a UUID$/, () => 'không đúng định dạng UUID'],
  [
    /^must be a valid ISO 8601 date string$/,
    () => 'không đúng định dạng ngày tháng',
  ],
  [/^should not be empty$/, () => 'không được để trống'],
  [
    /^must be one of the following values: (.+)$/,
    ([values]) => `chỉ nhận một trong các giá trị: ${values}`,
  ],
];

export function fieldLabel(property: string): string {
  return FIELD_LABELS[property] ?? property;
}

export function translateConstraint(property: string, message: string): string {
  if (/^property .+ should not exist$/.test(message)) {
    return `${fieldLabel(property)} không phải là trường hợp lệ`;
  }

  const eachPrefix = `each value in ${property} `;
  const isEach = message.startsWith(eachPrefix);
  const tail = isEach
    ? message.slice(eachPrefix.length)
    : message.startsWith(`${property} `)
      ? message.slice(property.length + 1)
      : message;

  for (const [pattern, build] of RULES) {
    const matched = pattern.exec(tail);
    if (matched) {
      const rendered = build(matched.slice(1));
      return isEach
        ? `Mỗi mục trong ${fieldLabel(property)} ${rendered}`
        : `${fieldLabel(property)} ${rendered}`;
    }
  }

  return isEach
    ? `Mỗi mục trong ${fieldLabel(property)} ${tail}`
    : `${fieldLabel(property)} ${tail}`;
}

export function toVietnameseMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  const walk = (error: ValidationError, path: string): void => {
    const property = path ? `${path}.${error.property}` : error.property;

    for (const message of Object.values(error.constraints ?? {})) {
      messages.push(translateConstraint(error.property, message));
    }
    for (const child of error.children ?? []) {
      walk(child, property);
    }
  };

  for (const error of errors) walk(error, '');
  return messages;
}

export function vietnameseValidationError(
  errors: ValidationError[],
): BadRequestException {
  const messages = toVietnameseMessages(errors);
  return new BadRequestException(
    messages.length > 0 ? messages : ['Dữ liệu gửi lên không hợp lệ'],
  );
}
