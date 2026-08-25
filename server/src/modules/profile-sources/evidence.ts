/** Một mẩu **bằng chứng** về ứng viên, lấy từ một nguồn cụ thể. */

export type EvidenceKind =
  /** Lớp text của một CV PDF. */
  | 'CV_PDF_TEXT'
  /** CV PDF dạng scan, đã đọc bằng model vision. */
  | 'CV_PDF_VISION'
  /** Repo công khai, ngôn ngữ, topic trên GitHub. */
  | 'GITHUB'
  /** File export dữ liệu do chính người dùng tải từ LinkedIn (KHÔNG scrape). */
  | 'LINKEDIN_EXPORT'
  /** Người dùng tự gõ. */
  | 'MANUAL';

export interface Evidence {
  kind: EvidenceKind;

  /** Nhãn hiện cho người dùng ở màn xác nhận, ví dụ "cv-tran-ba-mau.pdf". */
  label: string;

  /** Nội dung, dạng text thuần. */
  text: string;

  /** Số liệu về chính mẩu bằng chứng, để hiện ở màn xác nhận và để dò lỗi. */
  meta: Record<string, string | number | boolean>;
}

/** Một nguồn bằng chứng. */
export interface ProfileSource<I> {
  readonly kind: EvidenceKind;
  collect(input: I): Promise<Evidence[]>;
}

/** Đọc `Evidence[]` từ một giá trị JSON lấy ra khỏi database. */
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
