export interface ParsedSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

const NONE: ParsedSalary = { salaryMin: null, salaryMax: null, currency: null };

const NOT_MONTHLY_VND = /usd|\$|nghìn|ngàn|tuần|week|giờ|hour|ngày|day/;
const MILLION_UNIT = /\d\s*(triệu|tr\b|tr\d|tr[\s/-]|m\b)/;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const UPPER_ONLY = /^(tới|lên đến|up to|upto|dưới)\s/;
const LOWER_ONLY = /^(từ|trên|from)\s/;

const MIN_MONTHLY = 1_000_000;
const MAX_MONTHLY = 1_000_000_000;

function numberOf(token: string): number {
  if (/^\d{1,3}([.,]\d{3})+$/.test(token)) {
    return Number(token.replace(/[.,]/g, ''));
  }
  return Number(token.replace(',', '.'));
}

/** Đọc lương VND theo tháng từ chữ của portal; USD, lương tuần/giờ hay chữ không đọc được thì trả cả ba `null`. */
export function parseSalary(raw: string | null | undefined): ParsedSalary {
  if (!raw) return NONE;
  const text = raw.toLowerCase().trim();
  if (NOT_MONTHLY_VND.test(text)) return NONE;

  const inMillions = MILLION_UNIT.test(text);
  const values = (text.match(NUMBER) ?? []).map((token) => {
    const value = numberOf(token);
    return inMillions && value < 1_000 ? value * 1_000_000 : value;
  });
  if (!values.length) return NONE;
  if (values.some((value) => value < MIN_MONTHLY || value > MAX_MONTHLY)) {
    return NONE;
  }

  const first = Math.round(values[0]);
  const last = Math.round(values[values.length - 1]);

  if (values.length === 1 && UPPER_ONLY.test(text)) {
    return { salaryMin: null, salaryMax: first, currency: 'VND' };
  }
  if (values.length === 1 && LOWER_ONLY.test(text)) {
    return { salaryMin: first, salaryMax: null, currency: 'VND' };
  }
  if (first > last) return NONE;
  return { salaryMin: first, salaryMax: last, currency: 'VND' };
}
