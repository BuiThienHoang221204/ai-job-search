import { z } from 'zod';
import {
  cappedTextIn,
  cappedTextVi,
  type OutputLanguage,
} from '../../common/model-output.js';

const vn = (max: number, hint: string) => cappedTextVi(max, hint);

/** CV tailored, dịch từ 05-cv-templates.md. */
export const cvSchema = (language: OutputLanguage = 'vi') => {
  const t = (max: number, hint: string) => cappedTextIn(language, max, hint);

  return z.object({
    profileStatement: t(
      600,
      'Đoạn giới thiệu 3-4 câu, viết RIÊNG cho vị trí này chứ không dùng chung.',
    ),
    coreCompetencies: z
      .array(
        t(160, 'Một năng lực, diễn đạt theo đúng từ ngữ tin tuyển dụng dùng.'),
      )
      .min(3)
      .transform((items) => items.slice(0, 8)),
    experiences: z
      .array(
        z.object({
          position: t(120, 'Chức danh.'),
          company: t(120, 'Công ty.'),
          location: z.string().max(120).default(''),
          period: t(60, 'Khoảng thời gian, ví dụ "01/2022 - 06/2024".'),
          bullets: z
            .array(
              t(
                300,
                'Một gạch đầu dòng, bắt đầu bằng động từ, có kết quả đo được nếu hồ sơ có.',
              ),
            )
            .min(1)
            .transform((items) => items.slice(0, 5)),
        }),
      )
      .describe(
        'Lấy TỪ kinh nghiệm có thật trong hồ sơ. Được phép viết lại cách diễn đạt và đổi thứ tự để bám yêu cầu công việc, nhưng KHÔNG được thêm công ty, chức danh hay con số không có trong hồ sơ.',
      ),
    projects: z
      .array(
        z.object({
          name: t(200, 'Tên dự án.'),
          role: z
            .string()
            .max(120)
            .default('')
            .describe(
              'Vai trò trong dự án, ví dụ "Trưởng nhóm". Để trống nếu hồ sơ không nêu.',
            ),
          organization: z
            .string()
            .max(160)
            .default('')
            .describe(
              'Công ty, khách hàng, trường hoặc tổ chức. Để trống nếu là dự án cá nhân.',
            ),
          period: z.string().max(60).default(''),
          description: z
            .string()
            .max(400)
            .default('')
            .describe('Dự án LÀ GÌ, một tới hai câu.'),
          bullets: z
            .array(
              t(
                300,
                'Một gạch đầu dòng: bạn ĐÃ LÀM GÌ và kết quả đo được nếu hồ sơ có.',
              ),
            )
            .default([])
            .transform((items) => items.slice(0, 4)),
          tools: z
            .array(t(60, 'Một công cụ hoặc phương pháp đã dùng.'))
            .default([])
            .transform((items) => items.slice(0, 8))
            .describe(
              'Công cụ, phần mềm hoặc phương pháp của NGÀNH ứng viên đang làm, không mặc định là công nghệ phần mềm. Để mảng rỗng nếu hồ sơ không nêu.',
            ),
        }),
      )
      .default([])
      .transform((items) => items.slice(0, 4))
      .describe(
        'Lấy TỪ dự án có thật trong hồ sơ. Chọn 3-4 dự án bám sát tin tuyển dụng nhất chứ không liệt kê hết, và KHÔNG bịa dự án mới. Dự án phải nằm ở đây, KHÔNG được viết thành một mục kinh nghiệm làm việc.',
      ),
    educations: z
      .array(
        z.object({
          degree: t(160, 'Bằng cấp.'),
          institution: t(160, 'Trường.'),
          period: z.string().max(60).default(''),
          detail: z.string().max(300).default(''),
        }),
      )
      .transform((items) => items.slice(0, 4)),
    skillGroups: z
      .array(
        z.object({
          label: t(80, 'Tên nhóm kỹ năng, ví dụ "Ngôn ngữ", "Framework".'),
          items: z
            .array(t(60, 'Một kỹ năng.'))
            .min(1)
            .transform((items) => items.slice(0, 12)),
        }),
      )
      .transform((items) => items.slice(0, 6)),
  });
};

/**
 * CV sau khi NGƯỜI DÙNG sửa. Nới sàn của `cvSchema`, giữ nguyên trần.
 *
 * Phải là schema riêng vì hai bên ràng buộc hai thứ khác nhau: `cvSchema` ép model
 * viết đủ (tối thiểu 3 năng lực, mỗi kinh nghiệm ít nhất 1 gạch đầu dòng), còn ở
 * đây người dùng có quyền xoá bớt tới rỗng - dùng lại `cvSchema` thì thao tác xoá
 * dòng cuối cùng sẽ bị từ chối mà họ không hiểu vì sao.
 *
 * KHÔNG trường nào đặt `min(1)`, kể cả chức danh và bằng cấp: bấm "Thêm kinh
 * nghiệm" sinh ra một dòng RỖNG, và dòng đang nhập dở là trạng thái hợp lệ. Đặt sàn
 * ở đây thì vừa bấm Thêm là bản xem trước đứng im kèm lỗi 400. Dòng rỗng được
 * `cvContent` trong `document-renderer.service.ts` bỏ qua lúc vẽ.
 *
 * Trần độ dài thì GIỮ NGUYÊN: chữ này đi thẳng vào PDF và database.
 */
export const cvEditSchema = z.object({
  profileStatement: z.string().max(600).default(''),
  coreCompetencies: z.array(z.string().min(1).max(160)).max(12).default([]),
  experiences: z
    .array(
      z.object({
        position: z.string().max(120).default(''),
        company: z.string().max(120).default(''),
        location: z.string().max(120).default(''),
        period: z.string().max(60).default(''),
        bullets: z.array(z.string().min(1).max(300)).max(10).default([]),
      }),
    )
    .max(12)
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().max(200).default(''),
        role: z.string().max(120).default(''),
        organization: z.string().max(160).default(''),
        period: z.string().max(60).default(''),
        description: z.string().max(400).default(''),
        bullets: z.array(z.string().min(1).max(300)).max(10).default([]),
        tools: z.array(z.string().min(1).max(60)).max(20).default([]),
      }),
    )
    .max(8)
    .default([]),
  educations: z
    .array(
      z.object({
        degree: z.string().max(160).default(''),
        institution: z.string().max(160).default(''),
        period: z.string().max(60).default(''),
        detail: z.string().max(300).default(''),
      }),
    )
    .max(8)
    .default([]),
  skillGroups: z
    .array(
      z.object({
        label: z.string().max(80).default(''),
        items: z.array(z.string().min(1).max(60)).max(20).default([]),
      }),
    )
    .max(10)
    .default([]),
});

export type CvEditResult = z.infer<typeof cvEditSchema>;

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
    .transform((items) => items.slice(0, 3)),
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
    .transform((items) => items.slice(0, 3))
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
    .transform((items) => items.slice(0, 5))
    .describe(
      'Nhiều phương án ở các độ dài khác nhau để người dùng chọn theo giới hạn của portal.',
    ),
  recommended: vn(200, 'Nên dùng phương án nào và vì sao.'),
  cutFirst: vn(300, 'Nếu bị vượt giới hạn ký tự thì nên cắt câu nào trước.'),
});

export type CvContentResult = z.infer<ReturnType<typeof cvSchema>>;
export type CoverLetterResult = z.infer<typeof coverLetterSchema>;
export type ApplicationEmailResult = z.infer<typeof applicationEmailSchema>;
export type FormAnswerResult = z.infer<typeof formAnswerSchema>;
