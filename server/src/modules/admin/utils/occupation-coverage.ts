import { OCCUPATIONS, OTHER_CODE } from '../../jobs/taxonomy/occupations.js';
import { SUB_OCCUPATIONS } from '../../jobs/taxonomy/sub-occupations.js';

export interface OccupationCoverageRow {
  code: string;
  name: string;
  jobCount: number;
  /** Có ít nhất một lượt quét chạm ngành này (ở BẤT KỲ portal nào) trong cửa sổ đã chọn. */
  attempted: boolean;
  /** Chỉ bật khi ĐÃ quét mà vẫn 0 tin — chưa tới lượt trong chu kỳ phủ ~4 đêm không phải là báo động. */
  stale: boolean;
}

/** Mọi mã (nhóm + nghề con) một ngành có thể mang trong `OccupationCrawl.occupationCode`. */
function crawlCodesOf(groupCode: string): string[] {
  return [
    groupCode,
    ...(SUB_OCCUPATIONS[groupCode] ?? []).map((sub) => sub.code),
  ];
}

/** Ghép số tin (`Job.occupationCode`, luôn mã NHÓM) với mốc quét gần nhất, đo hộ chính màn hình "Chọn ngành nghề" mà admin từng phải tự chụp ảnh xem tay. */
export function occupationCoverage(
  jobCounts: Map<string, number>,
  crawledCodes: Set<string>,
): OccupationCoverageRow[] {
  return OCCUPATIONS.filter((occupation) => occupation.code !== OTHER_CODE).map(
    (occupation) => {
      const attempted = crawlCodesOf(occupation.code).some((code) =>
        crawledCodes.has(code),
      );
      const jobCount = jobCounts.get(occupation.code) ?? 0;

      return {
        code: occupation.code,
        name: occupation.name,
        jobCount,
        attempted,
        stale: attempted && jobCount === 0,
      };
    },
  );
}
