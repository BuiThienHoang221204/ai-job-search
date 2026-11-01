const TRACKING_EXACT = new Set([
  'gclid',
  'fbclid',
  'yclid',
  'msclkid',
  'gad_source',
  'ref',
  'ref_src',
  'source',
  'campaign',
  'ta_source',
  'u_sr_id',
  'click_source',
  'spm',
  'from',
  'trk',
  'sba',
  'type_keyword',
  'category_family',
]);
const TRACKING_PREFIX = /^(utm_|mc_|ga_|pk_|_ga)/i;

const isTracking = (key: string): boolean =>
  TRACKING_EXACT.has(key.toLowerCase()) || TRACKING_PREFIX.test(key);

/** Chuẩn hoá URL tin để dedup chắc hơn: bỏ fragment, bỏ tham số tracking (utm_*, ta_source,
 * click_source…), bỏ dấu "/" cuối. `new URL` đã hạ host về chữ thường. URL hỏng thì trả nguyên. */
export function cleanUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }
  url.hash = '';
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!isTracking(key)) kept.append(key, value);
  }
  url.search = kept.toString();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}
