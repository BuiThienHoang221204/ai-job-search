/** Bảng ánh xạ TAY từ mã nghề sang slug vị trí của nguồn lương, dùng làm đường lùi khi dò theo tên tin không ra. */
export const SUB_OCCUPATION_POSITIONS: Record<string, string[]> = {
  IT_BACKEND: [
    'it-software-backend-developer',
    'it-software-nodejs-developer',
    'it-software-java-developer',
    'it-software-php-developer',
    'it-software-python-developer',
    'it-software-net-developer',
  ],
  IT_FRONTEND: ['it-software-frontend-developer'],
  IT_FULLSTACK: [
    'it-software-fullstack-developer',
    'it-software-backend-developer',
    'it-software-frontend-developer',
  ],
  IT_SWE: [
    'it-software-backend-developer',
    'it-software-frontend-developer',
    'it-software-fullstack-developer',
    'it-software-java-developer',
    'it-software-net-developer',
    'it-software-python-developer',
  ],
  IT_MOBILE: [
    'it-software-mobile-developer',
    'it-software-android-developer',
    'it-software-ios-developer',
  ],
  IT_QA: ['it-software-manual-tester', 'it-software-automation-tester'],
  IT_DEVOPS: [
    'it-software-devops-engineer',
    'it-software-cloud-engineer',
    'it-software-system-engineer',
    'it-software-network-engineer',
  ],
  IT_SUPPORT: ['it-software-it-helpdesk-executive', 'it-software-it-executive'],
  IT_PM: [
    'it-software-it-project-manager',
    'it-software-product-owner',
    'it-software-business-analyst',
  ],

  DATA_ANALYST: ['it-software-data-analyst'],
  DATA_ENGINEER: ['it-software-data-engineer'],
  DATA_SCIENCE: ['it-software-data-scientist', 'it-software-ai-engineer'],

  DESIGN_UIUX: ['it-software-ui-ux-designer'],
  DESIGN_GRAPHIC: ['marketing-graphic-designer'],
  DESIGN_VIDEO: ['marketing-video-editor', 'marketing-content-creator'],

  MKT_DIGITAL: [
    'marketing-digital-marketing-executive',
    'marketing-paid-advertising-executive',
    'marketing-seo-executive',
  ],
  MKT_CONTENT: [
    'marketing-content-marketing-executive',
    'marketing-seo-content-executive',
    'marketing-content-creator',
  ],
  MKT_BRAND: ['marketing-brand-manager', 'marketing-marketing-manager'],
  MKT_SOCIAL: [
    'marketing-media-executive',
    'business-sales-social-media-page-administrator',
  ],

  SALES_B2B: [
    'business-sales-b2b-sales-executive',
    'business-sales-project-sales-specialist',
    'business-sales-key-account-executive',
  ],
  SALES_FIELD: [
    'business-sales-field-sales-executive',
    'business-sales-sales-executive',
    'business-sales-sales-representative',
  ],
  SALES_TELE: [
    'business-sales-telesales-executive',
    'business-sales-online-sales-executive',
  ],
  SALES_REALESTATE: ['business-sales-real-estate-sales-executive'],

  CS_CARE: ['business-sales-customer-service-executive'],
  CS_CALL: ['business-sales-customer-service-executive'],
  CS_RECEPTION: [
    'admin-office-hr-receptionist',
    'admin-office-hr-admin-receptionist',
  ],

  FIN_ACCOUNTING: [
    'accounting-auditing-finance-general-accountant',
    'accounting-auditing-finance-accountant',
    'accounting-auditing-finance-internal-accountant',
    'accounting-auditing-finance-payment-accountant',
    'accounting-auditing-finance-sales-accountant',
    'accounting-auditing-finance-receivables-accountant',
    'accounting-auditing-finance-warehouse-accountant',
  ],
  FIN_TAX: ['accounting-auditing-finance-tax-accountant'],
  FIN_AUDIT: ['accounting-auditing-finance-internal-control-specialist'],
  FIN_INVEST: ['accounting-auditing-finance-finance-specialist'],
  FIN_BANKING: [
    'finance-banking-teller',
    'finance-banking-personal-banking-relationship-specialist',
    'finance-banking-corporate-banking-relationship-specialist',
    'finance-banking-credit-control-specialist',
  ],
  FIN_INSURANCE: [
    'finance-banking-insurance-consultant',
    'finance-banking-insurance-consultant-bancassurance-channel',
  ],

  HR_RECRUIT: [
    'admin-office-hr-recruitment-specialist',
    'admin-office-hr-recruitment-training-specialist',
  ],
  HR_CB: [
    'admin-office-hr-c-b-specialist',
    'admin-office-hr-hr-executive',
    'admin-office-hr-training-specialist',
  ],
  HR_ADMIN: [
    'admin-office-hr-admin-executive',
    'admin-office-hr-hr-admin-executive',
  ],
  HR_LEGAL: [
    'admin-office-hr-legal-specialist',
    'admin-office-hr-legal-compliance-specialist',
  ],

  MFG_MECHANICAL: [
    'engineering-manufacturing-mechanical-engineer',
    'engineering-manufacturing-mechanical-design-engineer',
    'engineering-manufacturing-mechanical-technician',
  ],
  MFG_ELECTRICAL: [
    'engineering-manufacturing-electrical-engineer',
    'engineering-manufacturing-electromechanical-engineer',
    'engineering-manufacturing-electrical-technician',
  ],
  MFG_QAQC: [
    'engineering-manufacturing-qc-officer',
    'engineering-manufacturing-qa-officer',
    'engineering-manufacturing-quality-assurance-officer',
  ],
  MFG_OPERATOR: [
    'engineering-manufacturing-machine-operator',
    'engineering-manufacturing-production-operator',
  ],
  MFG_SAFETY: ['engineering-manufacturing-hse-officer'],

  LOG_WAREHOUSE: [
    'engineering-manufacturing-warehouse-assistant',
    'engineering-manufacturing-warehouse-keeper',
    'engineering-manufacturing-warehouse-worker',
  ],

  RET_STORE: ['business-sales-store-supervisor'],
  RET_MANAGER: ['business-sales-store-manager'],
  RET_ECOM: [
    'business-sales-e-commerce-platform-operations-executive',
    'business-sales-online-sales-executive',
  ],

  EDU_ADMISSION: ['business-sales-admissions-consultant'],

  MAN_WORKER: ['engineering-manufacturing-general-worker'],
};
