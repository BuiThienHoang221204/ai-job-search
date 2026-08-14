import type { ApplyOutcome, FillRule, PageReport } from './apply.types.js';

/// Những gì được phép rời khỏi máy chủ để đi vào một trang web của người khác.
///
/// Danh sách TRẮNG, và cố ý hẹp. Sandbox của Assisted Apply vừa mang dữ liệu hồ sơ
/// vừa có đường ra Internet, nên mỗi trường thêm vào đây là một trường có thể lộ.
/// Kỹ năng, mức lương mong muốn, ghi chú giấy phép lao động, `dealBreakers`… KHÔNG
/// nằm ở đây: form nào hỏi thì người dùng tự trả lời.
export interface ApplyIdentity {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
}

/// Tên file bên trong container. Không dùng tên thật của người dùng: nó đi vào một
/// trang web của người khác, và một tên file mang họ tên đầy đủ là dữ liệu thừa.
export const CV_FILENAME = 'cv.pdf';
export const COVER_FILENAME = 'cover-letter.pdf';
export const CV_PATH_IN_SANDBOX = `/work/${CV_FILENAME}`;
export const COVER_PATH_IN_SANDBOX = `/work/${COVER_FILENAME}`;

/// Tài liệu đang có để đính kèm. Thiếu cái nào thì KHÔNG sinh luật cho cái đó.
export interface ApplyDocuments {
  cv: boolean;
  coverLetter: boolean;
}

/**
 * Sinh bảng luật điền từ hồ sơ.
 *
 * Đây là phần đáng kiểm nhất của Assisted Apply, nên nó là hàm thuần: script chạy
 * trong trang chỉ ÁP DỤNG bảng này (dò chuỗi, gán giá trị), không tự suy gì.
 *
 * Thứ tự QUAN TRỌNG và không được sắp lại theo cảm giác: script lấy luật KHỚP ĐẦU
 * TIÊN. Ví dụ một ô tên là `email_confirmation` khớp cả `email`; còn ô `full name`
 * và ô `name of referrer` đều chứa `name`. Vì vậy luật hẹp phải đứng trước luật rộng,
 * và regex bám vào biên từ chứ không dò chuỗi con lỏng lẻo.
 */
export function buildFillRules(
  identity: ApplyIdentity,
  documents: ApplyDocuments = { cv: true, coverLetter: false },
): FillRule[] {
  const rules: FillRule[] = [];

  /*
   * File: thư xin việc XÉT TRƯỚC CV, và KHÔNG có luật dự phòng lỏng.
   *
   * Bản đầu dùng một luật duy nhất `(resume|cv|attach|upload|file|đính kèm)` cho ô
   * file. Chạy thật trên một form Greenhouse thì nó đính CV vào CẢ HAI ô — ô
   * "Resume/CV" và ô "Cover Letter" — vì nhãn kỹ thuật của cả hai đều là "Attach".
   * Gửi CV vào ô thư xin việc là lỗi người đọc hồ sơ thấy ngay.
   *
   * Nên: luật hẹp cho từng loại, và **không** có nhánh `attach|upload|file`. Ô file
   * không đọc được nhãn thì để `unmatched` cho người dùng tự đính kèm — thà thiếu
   * còn hơn đính sai tài liệu.
   */
  if (documents.coverLetter) {
    rules.push({
      match: '(cover[_\\s-]?letter|thư xin việc|thu xin viec)',
      value: COVER_PATH_IN_SANDBOX,
      kind: 'file',
    });
  }

  if (documents.cv) {
    rules.push({
      match: '(resume|\\bcv\\b|curriculum[_\\s-]?vitae|sơ yếu lý lịch)',
      value: CV_PATH_IN_SANDBOX,
      kind: 'file',
    });
  }

  rules.push({
    match: '(e-?mail|thư điện tử)',
    value: identity.email,
    kind: 'text',
  });

  if (identity.phone) {
    rules.push({
      match: '(phone|mobile|tel|điện thoại|sđt)',
      value: identity.phone,
      kind: 'text',
    });
  }

  /*
   * Họ tên: ba luật, và thứ tự giữa chúng là điểm dễ sai nhất.
   *
   * Form phương Tây hay tách `first_name` / `last_name`. Người Việt viết họ trước,
   * nên "Phạm Quản Trị" có họ là "Phạm" và tên gọi là "Trị" — cắt sai thì hồ sơ
   * mang một cái tên không phải của mình. Ta điền first = phần cuối, last = phần
   * đầu, đúng quy ước của form phương Tây (given name / family name).
   */
  const parts = identity.name.trim().split(/\s+/).filter(Boolean);
  const familyName = parts.length > 1 ? parts[0] : identity.name.trim();
  const givenName =
    parts.length > 1 ? parts[parts.length - 1] : identity.name.trim();

  rules.push(
    {
      match: '(first[_\\s-]?name|given[_\\s-]?name|tên gọi)',
      value: givenName,
      kind: 'text',
    },
    {
      /*
       * `họ` phải KHÔNG được đi trước `tên`.
       *
       * Không có lookahead này thì ô "Họ và tên" khớp luật họ và chỉ nhận được
       * "Phạm" — test `field-plan.spec.ts` bắt đúng lỗi đó. `\b` không dùng được ở
       * đây: `ọ` không phải ký tự `\w` nên `\bhọ\b` không hoạt động như mong đợi
       * với chữ có dấu.
       */
      match:
        '(last[_\\s-]?name|family[_\\s-]?name|surname|họ(?!\\s*(và\\s*)?tên))',
      value: familyName,
      kind: 'text',
    },
    // Luật rộng nhất của nhóm tên, nên nó đứng cuối nhóm.
    {
      match: '(full[_\\s-]?name|your[_\\s-]?name|\\bname\\b|họ và tên|họ tên)',
      value: identity.name,
      kind: 'text',
    },
  );

  if (identity.location) {
    rules.push({
      match: '(location|city|address|địa chỉ|địa điểm|thành phố)',
      value: identity.location,
      kind: 'text',
    });
  }

  return rules;
}

/// Dấu hiệu trang đòi đăng nhập, để script dò trong văn bản trang.
///
/// Chỉ những cụm CHẮC CHẮN nói về đăng nhập. Không dùng "account" hay "tài khoản":
/// một form ứng tuyển bình thường cũng có thể hỏi "tài khoản ngân hàng" hay
/// "account manager" trong mô tả, và một dấu hiệu sai sẽ khiến mọi trang đều bị xếp
/// thành LOGIN_WALL.
export const LOGIN_MARKERS = [
  'đăng nhập để ứng tuyển',
  'đăng nhập hoặc đăng ký',
  'sign in to apply',
  'log in to apply',
  'please sign in',
  'please log in',
] as const;

/**
 * Từ dữ liệu thô của script → kết luận.
 *
 * Thứ tự các nhánh là toàn bộ nội dung của hàm này, nên viết ra lý do:
 *
 * 1. Không tải được trang thì mọi thứ khác vô nghĩa.
 * 2. **Đã điền được gì thì FILLED, kể cả khi trang có dấu hiệu đăng nhập.** Nhiều
 *    trang ứng tuyển công khai vẫn có nút "Sign in" ở header; xếp chúng thành
 *    LOGIN_WALL thì ta tự bỏ đi chính những trang làm được việc.
 * 3. Có dấu hiệu đăng nhập mà không điền được gì → LOGIN_WALL. Đây là kết luận
 *    trung thực cho 4 portal Việt, không phải một lỗi.
 * 4. Không dấu hiệu, không điền được, nhưng có ô upload file → vẫn coi là có form
 *    (NO_FORM sẽ nói sai): người dùng vào xem ảnh rồi tự điền tiếp.
 */
export function classifyOutcome(report: PageReport): ApplyOutcome {
  if (!report.reachable) return 'UNREACHABLE';
  if (report.filled.length > 0) return 'FILLED';
  if (report.loginHints.length > 0) return 'LOGIN_WALL';
  if (report.hasFileInput) return 'FILLED';
  return 'NO_FORM';
}

/**
 * Câu hiện cho người dùng. Mỗi kết luận phải dẫn tới MỘT bước tiếp theo cụ thể.
 *
 * Không gộp thành "không ứng tuyển được": bốn kết luận này dẫn tới bốn hành động
 * khác nhau, và gộp lại là ném đi đúng phần có ích — cùng lý do như
 * `failureMessage` ở giao diện.
 */
export function outcomeMessage(
  outcome: ApplyOutcome,
  report: PageReport,
): string {
  switch (outcome) {
    case 'FILLED':
      return report.filled.length > 0
        ? `Đã điền ${report.filled.length} trường và đính kèm CV. Xem ảnh bên dưới, ` +
            'sửa lại nếu cần rồi tự bấm nộp trên trang tuyển dụng — hệ thống cố ý ' +
            'không bấm nút đó thay bạn.'
        : 'Tìm thấy form ứng tuyển nhưng chưa khớp được trường nào. Xem ảnh bên ' +
            'dưới rồi điền trực tiếp trên trang.';
    case 'LOGIN_WALL':
      return (
        'Trang này yêu cầu đăng nhập vào tài khoản của chính bạn trước khi ứng tuyển, ' +
        'nên hệ thống không đi tiếp được — và cũng không nên: làm vậy đòi giữ mật khẩu ' +
        'của bạn. Hãy mở link, đăng nhập, rồi dùng CV và thư đã soạn sẵn ở dưới.'
      );
    case 'NO_FORM':
      return (
        'Tải được trang nhưng không thấy form ứng tuyển nào. Tin này có thể nhận hồ sơ ' +
        'qua email, hoặc link đã đổi. Hãy mở link để kiểm tra.'
      );
    case 'UNREACHABLE':
      return (
        'Không mở được link tuyển dụng: có thể tin đã bị gỡ, hoặc trang chặn truy cập ' +
        'tự động. Hãy thử mở bằng trình duyệt của bạn.'
      );
  }
}
