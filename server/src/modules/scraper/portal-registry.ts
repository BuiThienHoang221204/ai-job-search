/** Suy khoá portal từ tên thư mục skill. */
export function portalKeyFrom(directory: string): string {
  return directory.replace(/-(search|jobs|portal)$/, '');
}

export type PortalEntry = {
  key: string;
  directory: string;
  /** Đường dẫn CLI tương đối so với gốc repo, dùng làm tham số cho `bun run`. */
  cliPath: string;
  enabled: boolean;
  /** Portal tự lọc được theo ngày đăng (LinkedIn có --jobage). */
  supportsJobAge: boolean;
  description: string;
};

/** Một thư mục skill có đủ điều kiện làm portal hay không. */
export function evaluateCandidate(input: {
  directory: string;
  hasSkillFile: boolean;
  hasCli: boolean;
  frontmatter: { enabled?: unknown; jobAge?: unknown; description?: unknown };
}): { entry: PortalEntry } | { skip: string } {
  if (!input.hasSkillFile) return { skip: 'không có SKILL.md' };
  if (!input.hasCli) return { skip: 'không có cli/src/cli.ts' };

  const raw = input.frontmatter.enabled;
  const enabled = raw === undefined || raw === null ? true : raw !== false;

  return {
    entry: {
      key: portalKeyFrom(input.directory),
      directory: input.directory,
      cliPath: `.agents/skills/${input.directory}/cli/src/cli.ts`,
      enabled,
      supportsJobAge: input.frontmatter.jobAge === true,
      description:
        typeof input.frontmatter.description === 'string'
          ? input.frontmatter.description
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 200)
          : '',
    },
  };
}
