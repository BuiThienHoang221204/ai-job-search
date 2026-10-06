export const EVIDENCE_KINDS = ['CV_PDF_TEXT', 'CV_PDF_VISION'] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface Evidence {
  kind: EvidenceKind;

  label: string;

  text: string;

  meta: Record<string, string | number | boolean>;
}

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
