import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

export type SkillManifest = {
  name: string;
  description: string;
  /**
   * Danh sách tool trong frontmatter của Claude Code. Engine chưa thi hành
   * tool nào, nhưng phải đọc để sau này chặn skill dùng tool không hỗ trợ.
   */
  allowedTools: string[];
  frameworkVersion?: string;
};

export type LoadedSkill = SkillManifest & {
  /** Phần thân của SKILL.md, đã bỏ frontmatter. */
  body: string;
  /** Các file tham chiếu cùng thư mục, ví dụ "04-job-evaluation.md". */
  references: Map<string, string>;
  contentHash: string;
};

/** Đọc các skill từ .claude/skills/ và giữ trong bộ nhớ. */
@Injectable()
export class SkillRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skills = new Map<string, LoadedSkill>();
  private readonly skillsDir: string;

  constructor(config: ConfigService) {
    this.skillsDir = config.get<string>('skills.dir')!;
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.skills.clear();

    let entries: Dirent[];
    try {
      entries = await readdir(this.skillsDir, { withFileTypes: true });
    } catch {
      this.logger.error(`Không đọc được thư mục skill: ${this.skillsDir}`);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dir = join(this.skillsDir, entry.name);
      let raw: string;
      try {
        raw = await readFile(join(dir, 'SKILL.md'), 'utf8');
      } catch {
        this.logger.warn(`Bỏ qua ${entry.name}: không có SKILL.md`);
        continue;
      }

      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      const references = new Map<string, string>();
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        if (
          !file.isFile() ||
          file.name === 'SKILL.md' ||
          !file.name.endsWith('.md')
        )
          continue;
        references.set(file.name, await readFile(join(dir, file.name), 'utf8'));
      }

      const hash = createHash('sha256');
      hash.update(parsed.content);
      for (const name of [...references.keys()].sort()) {
        hash.update(name);
        hash.update(references.get(name)!);
      }

      const skill: LoadedSkill = {
        name: typeof data.name === 'string' ? data.name : entry.name,
        description:
          typeof data.description === 'string' ? data.description : '',
        allowedTools:
          typeof data['allowed-tools'] === 'string'
            ? data['allowed-tools'].split(',').map((tool) => tool.trim())
            : [],
        frameworkVersion:
          typeof data.framework_version === 'string'
            ? data.framework_version
            : undefined,
        body: parsed.content,
        references,
        contentHash: hash.digest('hex').slice(0, 16),
      };

      this.skills.set(entry.name, skill);
      if (skill.name !== entry.name) this.skills.set(skill.name, skill);

      this.logger.log(
        `Nạp skill ${entry.name} (${references.size} file tham chiếu, hash ${skill.contentHash})`,
      );
    }
  }

  list(): SkillManifest[] {
    return [...new Set(this.skills.values())].map(
      ({ name, description, allowedTools, frameworkVersion }) => ({
        name,
        description,
        allowedTools,
        frameworkVersion,
      }),
    );
  }

  get(name: string): LoadedSkill {
    const skill = this.skills.get(name);
    if (!skill) throw new NotFoundException(`Không tìm thấy skill: ${name}`);
    return skill;
  }

  /**
   * Lấy một file tham chiếu, ví dụ
   * reference('job-application-assistant', '04-job-evaluation.md').
   */
  reference(skillName: string, fileName: string): string {
    const skill = this.get(skillName);
    const content = skill.references.get(fileName);
    if (!content) {
      throw new NotFoundException(
        `Skill ${skillName} không có file ${fileName}`,
      );
    }
    return content;
  }
}
