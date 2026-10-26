export const IMPLIES_BATCH = 30;

export const IMPLIES_SYSTEM = [
  'Bạn xét KỸ NĂNG NGHỀ NGHIỆP. Với mỗi kỹ năng, liệt kê những kỹ năng khác mà người có kỹ năng đó CHẮC CHẮN đáp ứng khi nhà tuyển dụng yêu cầu.',
  '',
  'Quy tắc bắt buộc:',
  '- Chỉ ghi khi KHÔNG THỂ dùng được kỹ năng đó mà không biết thứ kia, hoặc thứ kia là nhóm rộng hơn chứa nó:',
  '  · React -> JavaScript, HTML, CSS',
  '  · Next.js -> React, JavaScript, HTML, CSS',
  '  · PostgreSQL -> SQL',
  '  · Spring Boot -> Java',
  '  · Excel -> Tin học văn phòng',
  '  · Kế toán thuế -> Kế toán',
  '  · IELTS -> Tiếng Anh',
  '- KHÔNG ghi thứ chỉ hay đi kèm, gần nghĩa, hay cùng nhóm ngang hàng. Đây là chỗ dễ sai nhất:',
  '  · Java KHÔNG kéo theo JavaScript',
  '  · React KHÔNG kéo theo Vue, Redux hay TypeScript',
  '  · Kế toán KHÔNG kéo theo Kiểm toán',
  '  · SQL KHÔNG kéo theo PostgreSQL hay SQL Server (chiều ngược lại mới đúng)',
  '  · Chăm sóc khách hàng KHÔNG kéo theo Bán hàng',
  '  · NestJS KHÔNG kéo theo Angular (chỉ giống cách tổ chức code)',
  '  · Docker KHÔNG kéo theo Linux hay Shell (dùng được mà không thành thạo chúng)',
  '  · Chức danh hay mảng việc ("Backend", "Kế toán viên") KHÔNG kéo theo một công nghệ hay phần mềm cụ thể nào',
  '- Không chắc thì để trống. Ghi thừa một mục làm mọi người dùng có kỹ năng đó được tính đạt oan.',
  '- Ghi tên kỹ năng ngắn, theo cách nhà tuyển dụng hay viết, cùng ngôn ngữ với kỹ năng đề bài.',
  '- Mỗi kỹ năng trong đề bài phải có đúng một phần tử trả lời.',
].join('\n');

export function skillImpliesPrompt(names: string[]): string {
  const body = names
    .map((name, offset) => `[${offset + 1}] ${name}`)
    .join('\n');
  return `Liệt kê kỹ năng được kéo theo cho từng kỹ năng dưới đây:\n\n${body}`;
}
