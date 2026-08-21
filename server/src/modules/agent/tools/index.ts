import type { ToolSet } from 'ai';
import type {
  ArtifactRecord,
  ReadLog,
  ToolContext,
  ToolDeps,
} from '../agent.types.js';
import { askUserTool } from './ask-user.tool.js';
import { compilePdfTool } from './compile-pdf.tool.js';
import { fetchUrlTool } from './fetch-url.tool.js';
import { readProfileTool } from './read-profile.tool.js';
import { readSkillReferenceTool } from './read-skill-reference.tool.js';
import { readTemplateTool } from './read-template.tool.js';
import { saveArtifactTool } from './save-artifact.tool.js';
import { spawnReviewerTool } from './spawn-reviewer.tool.js';
import { webSearchTool } from './web-search.tool.js';

/**
 * Bộ tool của agent chính, và chỗ gom file nó ghi ra.
 *
 * Bộ này cố ý HẸP: không chạy lệnh, không ghi file tuỳ ý, không truy vấn SQL tự
 * do. Ở Claude Code, `/apply` được cấp Bash và Write vì nó chạy trên máy của
 * chính người dùng. Ở đây agent chạy trong máy chủ đa người dùng và đầu vào của
 * nó là mô tả công việc - dữ liệu do người lạ soạn - nên mỗi tool phải trả lời
 * được câu "nếu tin tuyển dụng cố tình điều khiển tool này thì mất gì".
 */
export function buildToolSet(
  deps: ToolDeps,
  context: ToolContext,
): { tools: ToolSet; artifacts: ArtifactRecord[] } {
  const artifacts: ArtifactRecord[] = [];

  /*
   * Sổ dùng chung cho ba tool ĐỌC: đọc lần hai chỉ nhận một câu nhắc, không
   * nhận lại nội dung. Dặn bằng system prompt đã thử và không ăn thua - lượt
   * chạy thật vẫn đọc `03-writing-style.md` hai lần, mất 15 giây và một prompt
   * phình ra vài nghìn token.
   */
  const seen: ReadLog = new Set();

  const tools: ToolSet = {
    read_profile: readProfileTool(deps, context, seen),
    read_skill_reference: readSkillReferenceTool(deps, seen),
    read_template: readTemplateTool(deps, seen),
    fetch_url: fetchUrlTool(deps),
    save_artifact: saveArtifactTool(deps, context, artifacts),
    spawn_reviewer: spawnReviewerTool(deps, context),
    compile_pdf: compilePdfTool(deps, context),
    ask_user: askUserTool(),
  };

  // Không có key thì KHÔNG đăng ký: agent thấy tool vắng mặt và tự xoay xở, còn
  // một tool luôn trả lỗi thì nó gọi lại nhiều lần, mỗi lần tốn một bước.
  if (deps.limits.search.apiKey) {
    tools.web_search = webSearchTool(deps);
  }

  return { tools, artifacts };
}
