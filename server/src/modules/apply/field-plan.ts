import type { ApplyOutcome, FillRule, PageReport } from './apply.types.js';

/** Những gì được phép rời khỏi máy chủ để đi vào một trang web của người khác. */
export interface ApplyIdentity {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
}

/**
 * Tên file bên trong container. Không dùng tên thật của người dùng: nó đi vào một
 * trang web của người khác, và một tên file mang họ tên đầy đủ là dữ liệu thừa.
 */
export const CV_FILENAME = 'cv.pdf';
export const COVER_FILENAME = 'cover-letter.pdf';
export const CV_PATH_IN_SANDBOX = `/work/${CV_FILENAME}`;
export const COVER_PATH_IN_SANDBOX = `/work/${COVER_FILENAME}`;

/** Tài liệu đang có để đính kèm. Thiếu cái nào thì KHÔNG sinh luật cho cái đó. */
export interface ApplyDocuments {
  cv: boolean;
  coverLetter: boolean;
}

/** Sinh bảng luật điền từ hồ sơ. */
export function buildFillRules(
  identity: ApplyIdentity,
  documents: ApplyDocuments = { cv: true, coverLetter: false },
): FillRule[] {
  const rules: FillRule[] = [];

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
      match:
        '(last[_\\s-]?name|family[_\\s-]?name|surname|họ(?!\\s*(và\\s*)?tên))',
      value: familyName,
      kind: 'text',
    },
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

/** Ô nào là CÂU HỎI thì không tự điền — dấu hiệu là nhãn có dấu hỏi. */
export const QUESTION_MARKS = ['?', '？'] as const;

/** Dấu hiệu trang đòi đăng nhập, để script dò trong văn bản trang. */
export const LOGIN_MARKERS = [
  'đăng nhập để ứng tuyển',
  'đăng nhập hoặc đăng ký',
  'sign in to apply',
  'log in to apply',
  'please sign in',
  'please log in',
] as const;

/** Từ dữ liệu thô của script → kết luận. */
export function classifyOutcome(report: PageReport): ApplyOutcome {
  if (!report.reachable) return 'UNREACHABLE';
  if (report.filled.length > 0) return 'FILLED';
  if (report.loginHints.length > 0) return 'LOGIN_WALL';
  if (report.hasFileInput) return 'FILLED';
  return 'NO_FORM';
}

/** Câu hiện cho người dùng. Mỗi kết luận phải dẫn tới MỘT bước tiếp theo cụ thể. */
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
