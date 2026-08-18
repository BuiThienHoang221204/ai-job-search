import { Injectable, Logger } from '@nestjs/common';
import type { Profile } from '../../../generated/prisma/client.js';

const NOT_PROVIDED = '(hồ sơ chưa cung cấp thông tin này)';

/** Thay các token [PLACEHOLDER] trong file skill bằng dữ liệu hồ sơ lấy từ DB. */
@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  private placeholders(profile: Profile | null): Record<string, string> {
    const list = (values: string[] | undefined | null): string =>
      values && values.length ? values.join(', ') : NOT_PROVIDED;
    const text = (value: string | null | undefined): string =>
      value?.trim() || NOT_PROVIDED;
    const goal = (index: number): string =>
      profile?.careerGoals?.[index] ?? NOT_PROVIDED;

    return {
      YOUR_NAME: NOT_PROVIDED,
      YOUR_PRIMARY_SKILLS: list(profile?.primarySkills),
      YOUR_SECONDARY_SKILLS: list(profile?.secondarySkills),
      SKILLS_YOU_LACK: list(profile?.lackingSkills),
      YOUR_DIRECT_EXPERIENCE_DOMAINS: list(profile?.directExperienceDomains),
      YOUR_ADJACENT_EXPERIENCE: list(profile?.adjacentExperience),
      ROLES_WITH_LIMITED_EXPERIENCE: list(profile?.lackingSkills),
      YOUR_CAREER_GOAL_1: goal(0),
      YOUR_CAREER_GOAL_2: goal(1),
      YOUR_CAREER_GOAL_3: goal(2),
      YOUR_ENERGIZING_TASKS: list(profile?.energizingTasks),
      YOUR_DRAINING_TASKS: list(profile?.drainingTasks),
      YOUR_COMMUTE_CONSTRAINTS: text(profile?.commuteConstraint),
      YOUR_CITY: text(profile?.location),
      YOUR_COUNTRY: text(profile?.country),
      YOUR_LANGUAGES: list(profile?.languages),
      YOUR_EMPLOYMENT_STATUS: text(profile?.employmentStatus),
      YOUR_LINKEDIN_HEADLINE: text(profile?.headline),
      YOUR_FINANCIAL_SITUATION_CONTEXT: NOT_PROVIDED,
      YOUR_SCHEDULE_CONSTRAINTS: text(profile?.commuteConstraint),
      YOUR_GROWTH_PRIORITIES: list(profile?.careerGoals),
    };
  }

  /** Thay placeholder trong một đoạn skill. */
  render(template: string, profile: Profile | null): string {
    const table = this.placeholders(profile);
    const unresolved = new Set<string>();

    const rendered = template.replace(
      /\[([A-Z][A-Z0-9_]{2,})\]/g,
      (match, token: string) => {
        if (token in table) return table[token];
        unresolved.add(token);
        return NOT_PROVIDED;
      },
    );

    if (unresolved.size) {
      this.logger.debug(
        `Placeholder chưa có ánh xạ: ${[...unresolved].join(', ')}`,
      );
    }
    return rendered;
  }

  /** Giữ lại một số mục `##` của file skill và bỏ phần còn lại. */
  keepSections(markdown: string, headings: string[]): string {
    const wanted = headings.map((heading) => heading.toLowerCase());
    const blocks = markdown.split(/^## /m);
    const kept: string[] = [];

    for (const block of blocks.slice(1)) {
      const title = block.split('\n', 1)[0].trim().toLowerCase();
      if (wanted.some((heading) => title.startsWith(heading)))
        kept.push(`## ${block.trimEnd()}`);
    }

    return kept.join('\n\n');
  }

  /** Bỏ một mục con `###` khỏi đoạn đã chọn. */
  dropSubsection(markdown: string, heading: string): string {
    const pattern = new RegExp(
      `^### .*${heading}[\\s\\S]*?(?=^### |^## |\\Z)`,
      'mi',
    );
    return markdown.replace(pattern, '');
  }

  /** Tóm tắt hồ sơ thành khối văn bản đưa vào prompt. */
  profileSummary(profile: Profile | null): string {
    if (!profile) return 'Ứng viên chưa hoàn thiện hồ sơ.';

    const lines: string[] = [];
    const push = (label: string, value: string | null | undefined): void => {
      if (value?.trim()) lines.push(`- ${label}: ${value.trim()}`);
    };
    const pushList = (
      label: string,
      values: string[] | null | undefined,
    ): void => {
      if (values?.length) lines.push(`- ${label}: ${values.join(', ')}`);
    };

    push('Chức danh', profile.headline);
    push('Địa điểm', profile.location);
    push('Quốc gia', profile.country);
    pushList('Ngôn ngữ', profile.languages);
    push('Tình trạng', profile.employmentStatus);
    push('Quốc tịch', profile.citizenship);
    push('Giấy phép lao động', profile.workPermit);
    pushList('Kỹ năng chính', profile.primarySkills);
    pushList('Kỹ năng phụ', profile.secondarySkills);
    pushList('Kỹ năng còn thiếu', profile.lackingSkills);
    pushList(
      'Lĩnh vực có kinh nghiệm trực tiếp',
      profile.directExperienceDomains,
    );
    pushList('Kinh nghiệm liên quan', profile.adjacentExperience);
    pushList('Mục tiêu nghề nghiệp', profile.careerGoals);
    pushList('Công việc tạo hứng thú', profile.energizingTasks);
    pushList('Công việc gây chán nản', profile.drainingTasks);
    pushList('Ngành mục tiêu', profile.targetSectors);
    pushList('Điều không chấp nhận', profile.dealBreakers);
    push('Ràng buộc đi lại', profile.commuteConstraint);
    push('Ưu tiên làm việc từ xa', profile.remotePreference);
    lines.push(
      `- Sẵn sàng chuyển nơi ở: ${profile.willingToRelocate ? 'có' : 'không'}`,
    );
    push('Giới thiệu', profile.summary);

    if (profile.experiences) {
      lines.push(
        `- Kinh nghiệm làm việc (JSON): ${JSON.stringify(profile.experiences)}`,
      );
    }
    if (profile.educations) {
      lines.push(`- Học vấn (JSON): ${JSON.stringify(profile.educations)}`);
    }
    if (profile.behavioralTraits) {
      lines.push(
        `- Đặc điểm hành vi (JSON): ${JSON.stringify(profile.behavioralTraits)}`,
      );
    }

    return lines.join('\n');
  }
}
