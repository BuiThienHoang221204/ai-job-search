import type {
  LoadedSkill,
  SkillManifest,
} from '../services/skill-registry.service.js';

// Bản công khai của skill: bỏ nội dung prompt, chỉ giữ tên và kích thước từng file tham chiếu để admin biết skill nạp những gì.
export function toManifest(skill: LoadedSkill): SkillManifest {
  return {
    name: skill.name,
    description: skill.description,
    allowedTools: skill.allowedTools,
    frameworkVersion: skill.frameworkVersion,
    contentHash: skill.contentHash,
    bodyBytes: Buffer.byteLength(skill.body, 'utf8'),
    references: [...skill.references]
      .map(([name, content]) => ({
        name,
        bytes: Buffer.byteLength(content, 'utf8'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
