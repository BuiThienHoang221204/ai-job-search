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
