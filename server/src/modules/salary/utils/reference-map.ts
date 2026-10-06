const BY_INDUSTRY: Record<string, string> = {
  'it-software': 'IT',
  'accounting-auditing-finance': 'FINANCE',
  'finance-banking': 'FINANCE',
  'admin-office-hr': 'HR',
  'business-sales': 'SALES',
  marketing: 'MARKETING',
  'engineering-manufacturing': 'MANUFACTURING',
};

const BY_POSITION: Record<string, string> = {
  'ai-engineer': 'DATA_AI',
  'data-analyst': 'DATA_AI',
  'data-engineer': 'DATA_AI',
  'data-scientist': 'DATA_AI',
  'ui-ux-designer': 'DESIGN',

  'customer-relationship-specialist': 'CUSTOMER',
  'customer-service-executive': 'CUSTOMER',
  'store-manager': 'RETAIL',
  'store-supervisor': 'RETAIL',
  'admissions-consultant': 'EDUCATION',
  'marketing-executive': 'MARKETING',

  'graphic-designer': 'DESIGN',
  'video-editor': 'DESIGN',
  'content-creator': 'DESIGN',

  'warehouse-assistant': 'LOGISTICS',
  'warehouse-keeper': 'LOGISTICS',
  'warehouse-manager': 'LOGISTICS',
  'warehouse-worker': 'LOGISTICS',
  'general-worker': 'MANUAL',
  'production-operator': 'MANUAL',
  'machine-operator': 'MANUAL',

  'legal-specialist': 'OTHER',
  'legal-compliance-specialist': 'OTHER',
};

export function referenceOccupation(
  positionSlug: string,
  industrySlug: string,
): string | null {
  const prefix = `${industrySlug}-`;
  const bare = positionSlug.startsWith(prefix)
    ? positionSlug.slice(prefix.length)
    : positionSlug;

  return BY_POSITION[bare] ?? BY_INDUSTRY[industrySlug] ?? null;
}
