import { z } from 'zod';

const vn = (max: number, hint: string) =>
  z.string().min(1).max(max).describe(`${hint} Viết bằng tiếng Việt có dấu.`);

/** CV tailored, dịch từ 05-cv-templates.md. */
export const cvSchema = z.object({
  profileStatement: vn(
    600,
    'Đoạn giới thiệu 3-4 câu, viết RIÊNG cho vị trí này chứ không dùng chung.',
  ),
  coreCompetencies: z
    .array(
      vn(160, 'Một năng lực, diễn đạt theo đúng từ ngữ tin tuyển dụng dùng.'),
    )
    .min(3)
    .max(8),
  experiences: z
    .array(
      z.object({
        position: vn(120, 'Chức danh.'),
        company: vn(120, 'Công ty.'),
        location: z.string().max(120).default(''),
        period: vn(60, 'Khoảng thời gian, ví dụ "01/2022 - 06/2024".'),
        bullets: z
          .array(
            vn(
              300,
              'Một gạch đầu dòng, bắt đầu bằng động từ, có kết quả đo được nếu hồ sơ có.',
            ),
          )
          .min(1)
          .max(5),
      }),
    )
    .max(6)
    .describe(
      'Lấy TỪ kinh nghiệm có thật trong hồ sơ. Được phép viết lại cách diễn đạt và đổi thứ tự để bám yêu cầu công việc, nhưng KHÔNG được thêm công ty, chức danh hay con số không có trong hồ sơ.',
    ),
  educations: z
    .array(
      z.object({
        degree: vn(160, 'Bằng cấp.'),
        institution: vn(160, 'Trường.'),
        period: z.string().max(60).default(''),
        detail: z.string().max(300).default(''),
      }),
    )
    .max(4),
  skillGroups: z
    .array(
      z.object({
        label: vn(80, 'Tên nhóm kỹ năng, ví dụ "Ngôn ngữ", "Framework".'),
        items: z.array(z.string().min(1).max(60)).min(1).max(12),
      }),
    )
    .max(6),
});

/** Thư xin việc, dịch từ 06-cover-letter-templates.md và 03-writing-style.md. */
export const coverLetterSchema = z.object({
  salutation: vn(
    120,
    'Lời chào. Dùng tên người liên hệ nếu tin tuyển dụng có nêu, nếu không thì "Kính gửi Bộ phận Tuyển dụng".',
  ),
  opening: vn(
    600,
    'Đoạn mở. KHÔNG được lặp lại lời chào ở đây - salutation đã là một trường riêng và sẽ được in ra trước đoạn này. Bắt đầu thẳng vào nội dung: vị trí ứng tuyển và lý do mạnh nhất.',
  ),
  bodyParagraphs: z
    .array(
      vn(
        700,
        'Một đoạn thân bài, nối kinh nghiệm cụ thể với một yêu cầu cụ thể của công việc.',
      ),
    )
    .min(1)
    .max(3),
  motivation: vn(
    600,
    'Vì sao là công ty NÀY. Phải nhắc đến thứ cụ thể về công ty, không được chung chung.',
  ),
  closing: vn(400, 'Đoạn kết, hướng về bước tiếp theo.'),
});

/**
 * Mail ứng tuyển gửi thẳng cho nhà tuyển dụng.
 *
 * KHÔNG có trường nào cho tên, email hay số điện thoại: chữ ký được hệ thống
 * ghép từ hồ sơ trong `documents.service.ts`. Để model tự viết thông tin liên hệ
 * là mở đường cho một số điện thoại bịa nằm trong mail đã gửi đi, và người dùng
 * không có cách nào biết.
 */
export const applicationEmailSchema = z.object({
  subject: vn(
    160,
    'Tiêu đề mail, dạng "Ứng tuyển vị trí <chức danh> - <tên ứng viên>". Không viết hoa toàn bộ, không dấu chấm than.',
  ),
  greeting: vn(
    120,
    'Lời chào. Dùng tên người liên hệ nếu tin tuyển dụng có nêu, nếu không thì "Kính gửi Bộ phận Tuyển dụng <tên công ty>,".',
  ),
  paragraphs: z
    .array(
      vn(
        700,
        'Một đoạn thân mail, 2-4 câu. Đoạn đầu nói rõ ứng tuyển vị trí nào và biết tin từ đâu là không cần thiết; đi thẳng vào lý do phù hợp.',
      ),
    )
    .min(2)
    .max(3)
    .describe(
      'Toàn bộ thân mail. Mail được đọc trên điện thoại nên tổng cộng chỉ 150-250 chữ.',
    ),
  attachmentNote: vn(
    300,
    'Một câu nhắc tới CV đính kèm và mời nhà tuyển dụng đọc. Không liệt kê lại nội dung CV.',
  ),
  closing: vn(
    300,
    'Câu kết, hướng về bước tiếp theo. Cảm ơn ngắn gọn, không nài nỉ.',
  ),
  signOff: vn(60, 'Lời chào kết, ví dụ "Trân trọng,". Kết thúc bằng dấu phẩy.'),
});

/**
 * Câu trả lời cho ô văn bản tự do trong form ứng tuyển, dịch từ
 * 08-application-forms.md.
 */
export const formAnswerSchema = z.object({
  answers: z
    .array(
      z.object({
        variant: vn(
          80,
          'Nhãn của phương án, ví dụ "Bản đầy đủ", "Bản rút gọn".',
        ),
        text: z
          .string()
          .min(1)
          .max(2500)
          .describe('Nội dung để dán vào ô form. Tiếng Việt có dấu.'),
        characterCount: z
          .number()
          .int()
          .min(1)
          .describe(
            'Số ký tự của text. Hệ thống sẽ đếm lại và ghi đè nếu lệch.',
          ),
      }),
    )
    .min(2)
    .max(5)
    .describe(
      'Nhiều phương án ở các độ dài khác nhau để người dùng chọn theo giới hạn của portal.',
    ),
  recommended: vn(200, 'Nên dùng phương án nào và vì sao.'),
  cutFirst: vn(300, 'Nếu bị vượt giới hạn ký tự thì nên cắt câu nào trước.'),
});

export type CvContentResult = z.infer<typeof cvSchema>;
export type CoverLetterResult = z.infer<typeof coverLetterSchema>;
export type ApplicationEmailResult = z.infer<typeof applicationEmailSchema>;
export type FormAnswerResult = z.infer<typeof formAnswerSchema>;
