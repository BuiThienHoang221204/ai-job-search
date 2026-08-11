/// Suy khoá portal từ tên thư mục skill.
///
/// `itviec-search` -> `itviec`, `linkedin-search` -> `linkedin`. Bỏ hậu tố
/// `-search` vì nó là quy ước đặt tên của framework chứ không mang thông tin;
/// giữ lại thì API sẽ đòi `?portal=itviec-search`, dài mà chẳng rõ hơn.
export function portalKeyFrom(directory: string): string {
  return directory.replace(/-(search|jobs|portal)$/, '');
}

export type PortalEntry = {
  key: string;
  directory: string;
  /// Đường dẫn CLI tương đối so với gốc repo, dùng làm tham số cho `bun run`.
  cliPath: string;
  enabled: boolean;
  description: string;
};

/// Một thư mục skill có đủ điều kiện làm portal hay không.
///
/// Tách khỏi phần đọc đĩa để test được: hàm này chỉ nhận sự kiện đã quan sát
/// (có SKILL.md không, có cli.ts không, frontmatter ghi gì) và trả về kết luận.
export function evaluateCandidate(input: {
  directory: string;
  hasSkillFile: boolean;
  hasCli: boolean;
  frontmatter: { enabled?: unknown; description?: unknown };
}): { entry: PortalEntry } | { skip: string } {
  if (!input.hasSkillFile) return { skip: 'không có SKILL.md' };
  if (!input.hasCli) return { skip: 'không có cli/src/cli.ts' };

  // `enabled` vắng mặt thì coi như bật. Framework dùng quy ước này: chỉ khi
  // muốn TẮT mới phải ghi ra.
  const raw = input.frontmatter.enabled;
  const enabled = raw === undefined || raw === null ? true : raw !== false;

  return {
    entry: {
      key: portalKeyFrom(input.directory),
      directory: input.directory,
      cliPath: `.agents/skills/${input.directory}/cli/src/cli.ts`,
      enabled,
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
