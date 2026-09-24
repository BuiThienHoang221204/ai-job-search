/** Nguồn gốc của một mẩu bằng chứng. `CV_PDF_VISION` chưa làm, xem README mục "Lớp text trước, vision sau". */
export const EVIDENCE_KINDS = ['CV_PDF_TEXT', 'CV_PDF_VISION'] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Một mẩu bằng chứng về ứng viên, lấy từ một nguồn cụ thể. */
export interface Evidence {
  kind: EvidenceKind;

  /** Nhãn hiện cho người dùng ở màn xác nhận, ví dụ "cv-tran-ba-mau.pdf". */
  label: string;

  /** Nội dung dạng text thuần. KHÔNG TIN CẬY: người dùng nộp lên và nó đi thẳng vào prompt. */
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

  const kinds: readonly string[] = EVIDENCE_KINDS;

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
