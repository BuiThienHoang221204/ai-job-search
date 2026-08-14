/**
 * Một mẩu **bằng chứng** về ứng viên, lấy từ một nguồn cụ thể.
 *
 * Đây là kiểu dữ liệu trung tâm của SEAM 3. Mọi nguồn — CV PDF, GitHub, file
 * export LinkedIn, nhập tay — đều quy về đúng hình dạng này, và `ProfileSynthesizer`
 * chỉ biết tới `Evidence[]` chứ không biết nguồn nào sinh ra nó.
 *
 * Vì sao gọi là "bằng chứng" chứ không phải "dữ liệu hồ sơ": tên gọi mang theo
 * quy tắc quan trọng nhất của Agent 1 trong đề tài — model **suy ra đề xuất từ**
 * bằng chứng, và người dùng mới là bên chốt. Không mẩu nào trong đây được ghi
 * thẳng vào bảng `Profile`.
 */

export type EvidenceKind =
  /// Lớp text của một CV PDF.
  | 'CV_PDF_TEXT'
  /// CV PDF dạng scan, đã đọc bằng model vision.
  | 'CV_PDF_VISION'
  /// Repo công khai, ngôn ngữ, topic trên GitHub.
  | 'GITHUB'
  /// File export dữ liệu do chính người dùng tải từ LinkedIn (KHÔNG scrape).
  | 'LINKEDIN_EXPORT'
  /// Người dùng tự gõ.
  | 'MANUAL';

export interface Evidence {
  kind: EvidenceKind;

  /**
   * Nhãn hiện cho người dùng ở màn xác nhận, ví dụ "cv-tran-ba-mau.pdf".
   *
   * Cần thiết vì màn xác nhận phải trả lời được câu "vì sao AI nghĩ tôi biết
   * Kubernetes?" — không truy được về nguồn thì người dùng không có cơ sở nào để
   * đồng ý hay từ chối, và bước xác nhận thành bấm bừa.
   */
  label: string;

  /**
   * Nội dung, dạng text thuần.
   *
   * **KHÔNG TIN CẬY.** Chuỗi này do người ngoài kiểm soát và sẽ đi vào prompt,
   * nên nó phải được đối xử như đầu vào của người lạ: có chặn độ dài, có ranh giới
   * rõ trong prompt, và tuyệt đối không được nối vào phần chỉ dẫn hệ thống.
   */
  text: string;

  /**
   * Số liệu về chính mẩu bằng chứng, để hiện ở màn xác nhận và để dò lỗi.
   *
   * Cố ý KHÔNG đưa vào prompt: đây là thông tin về việc trích xuất, không phải
   * thông tin về ứng viên.
   */
  meta: Record<string, string | number | boolean>;
}

/**
 * Một nguồn bằng chứng.
 *
 * `I` là kiểu đầu vào riêng của từng nguồn — CV cần buffer và tên file, GitHub
 * cần username, LinkedIn cần file zip. Cố ý không gộp thành một kiểu chung: gộp
 * lại thì mỗi nguồn phải nhận một object có phần lớn trường không dùng, và không
 * còn gì bắt lỗi khi gọi sai.
 */
export interface ProfileSource<I> {
  readonly kind: EvidenceKind;
  collect(input: I): Promise<Evidence[]>;
}

/**
 * Đọc `Evidence[]` từ một giá trị JSON lấy ra khỏi database.
 *
 * KHÔNG ép kiểu bằng `as Evidence[]`, và đó là điểm chính của hàm này. Cột
 * `ProfileDraft.evidence` là `Json`, nên kiểu tĩnh ở đây chỉ là niềm tin: hàng dữ
 * liệu có thể do một phiên bản code cũ ghi, do sửa tay, hoặc do một migration
 * chưa hoàn tất. Ép kiểu thì `evidence[0].text` thành `undefined` và chảy tiếp vào
 * prompt — đúng cái đã xảy ra ba lần ở phía frontend với `UpskillReportRecord`,
 * `InterviewPrepRecord` và `AiFailureRecord`.
 *
 * Mẩu nào không đúng hình dạng thì bị BỎ, không được vá tạm. Một mẩu bằng chứng
 * thiếu `text` không có giá trị nào để cứu, còn đoán bù vào thì thành bịa.
 */
export function parseEvidenceList(value: unknown): Evidence[] {
  if (!Array.isArray(value)) return [];

  const kinds: readonly string[] = [
    'CV_PDF_TEXT',
    'CV_PDF_VISION',
    'GITHUB',
    'LINKEDIN_EXPORT',
    'MANUAL',
  ];

  return value.filter((item): item is Evidence => {
    if (typeof item !== 'object' || item === null) return false;
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.kind === 'string' &&
      kinds.includes(candidate.kind) &&
      typeof candidate.label === 'string' &&
      typeof candidate.text === 'string' &&
      candidate.text.length > 0 &&
      typeof candidate.meta === 'object' &&
      candidate.meta !== null
    );
  });
}
