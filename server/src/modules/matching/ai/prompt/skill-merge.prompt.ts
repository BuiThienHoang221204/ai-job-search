/** Số ứng viên đưa cho model chọn. Rộng hơn không giúp, chỉ làm loãng đề bài. */
export const SHORTLIST = 5;

/** Số chuỗi hỏi trong MỘT lượt gọi model. Hạn mức tính theo lượt, không theo token. */
export const BATCH = 20;

export const SYSTEM = [
  'Bạn phân loại KỸ NĂNG NGHỀ NGHIỆP. Với mỗi chuỗi, chọn ứng viên chỉ CÙNG MỘT kỹ năng với nó.',
  '',
  'Quy tắc bắt buộc:',
  '- CÙNG MỘT kỹ năng nghĩa là người tuyển dụng viết cách này hay cách kia đều nhận cùng một ứng viên: viết tắt, dịch sang ngôn ngữ khác, hoặc cách gọi khác của đúng nghề đó.',
  '- GẦN NGHĨA thì KHÔNG phải cùng một kỹ năng. Đây là chỗ dễ sai nhất, và sai ở đây ghép ứng viên với công việc họ không làm được:',
  '  · Java và JavaScript là hai ngôn ngữ khác nhau -> 0',
  '  · Kế toán và Kiểm toán là hai nghề khác nhau -> 0',
  '  · Điều dưỡng và Bác sĩ là hai nghề khác nhau -> 0',
  '  · React và Vue là hai thư viện khác nhau -> 0',
  '- Ngược lại, những cặp sau ĐÚNG là một: Y tá và Điều dưỡng, K8s và Kubernetes, CSKH và Chăm sóc khách hàng, Nurse và Điều dưỡng.',
  '- PHẦN LỚN trường hợp đáp án đúng là 0. Ứng viên được đề cử vì gần nghĩa, chứ không phải vì đã đúng.',
  '- Ứng viên nào ghi "mã này đã gồm: ..." thì chuỗi của bạn phải cùng một kỹ năng với TẤT CẢ những cái đó, không riêng cái đứng đầu.',
  '- Không chắc thì trả 0. Tách nhầm chỉ làm danh bạ dài thêm; gộp nhầm làm hỏng kết quả của mọi người dùng.',
  '- Mỗi chuỗi trong đề bài phải có đúng một dòng trả lời.',
].join('\n');

/** Chuỗi cần phân loại kèm ứng viên gần nhất, đã rút gọn về đúng thứ model cần thấy. */
export type MergeQuestion = {
  index: number;
  raw: string;
  near: { name: string; aliases: string[] }[];
};

/** Phải in cả `aliases` của ứng viên: thiếu chúng thì model gộp dây chuyền mà không biết nhóm đã phình tới đâu. */
export function skillMergePrompt(questions: MergeQuestion[]): string {
  const body = questions
    .map((row) =>
      [
        `[${row.index}] ${row.raw}`,
        ...row.near.map((near, at) => {
          const others = near.aliases.filter((alias) => alias !== near.name);
          const seen = others.length
            ? ` (mã này đã gồm: ${others.join(', ')})`
            : '';
          return `    ${at + 1}. ${near.name}${seen}`;
        }),
      ].join('\n'),
    )
    .join('\n\n');

  return `Phân loại từng chuỗi dưới đây:\n\n${body}`;
}
