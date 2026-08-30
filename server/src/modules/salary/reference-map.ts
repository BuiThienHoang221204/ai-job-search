/**
 * Xếp một vị trí trong bảng lương tham chiếu về mã ngành của hệ thống.
 *
 * Chia hai tầng: mặc định theo ngành của nguồn, rồi ghi đè cho những vị trí nằm
 * lệch nhóm. Trả `null` khi không xếp được - bản ghi đó vẫn nằm trong kho làm tư
 * liệu đối chiếu nhưng không bao giờ hiển thị, vì đoán bừa còn tệ hơn không có.
 */
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

/**
 * Nguồn đặt slug vị trí có LẶP LẠI slug ngành ở đầu - "it-software-data-analyst".
 * Cắt tiền tố đó ra trước khi tra bảng ghi đè, nếu không mọi quy tắc ghi đè đều
 * trượt và tất cả rơi về mặc định theo ngành.
 */
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
