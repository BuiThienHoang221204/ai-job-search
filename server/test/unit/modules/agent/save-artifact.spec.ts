import { saveArtifactTool } from 'src/modules/agent/tools/save-artifact.tool.js';
import type {
  ArtifactRecord,
  ToolDeps,
} from 'src/modules/agent/agent.types.js';

const CONTEXT = { runId: 'run-1', userId: 'nguoi-a' };

const OPTIONS = { toolCallId: 'x', messages: [] } as never;

type SaveResult = {
  saved?: string;
  bytes?: number;
  unchanged?: boolean;
  error?: string;
};

const build = () => {
  const write = jest.fn<Promise<void>, [string, string]>(() =>
    Promise.resolve(),
  );
  const artifacts: ArtifactRecord[] = [];
  const tool = saveArtifactTool(
    { storage: { write } } as unknown as ToolDeps,
    CONTEXT,
    artifacts,
  );

  const save = (name: string, content: string): Promise<SaveResult> =>
    tool.execute({ name, content }, OPTIONS) as Promise<SaveResult>;

  return { save, write, artifacts };
};

describe('save_artifact', () => {
  it('lưu lần đầu thì ghi xuống storage', async () => {
    const { save, write, artifacts } = build();

    const result = await save('cv/main.tex', 'ban dau');

    expect(result.saved).toBe('cv/main.tex');
    expect(write).toHaveBeenCalledTimes(1);
    expect(artifacts).toHaveLength(1);
  });

  it('nội dung y hệt thì KHÔNG ghi lại', async () => {
    const { save, write } = build();

    await save('cv/main.tex', 'y het');
    const again = await save('cv/main.tex', 'y het');

    expect(again.unchanged).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('sửa rồi lưu lại thì vẫn ghi', async () => {
    const { save, write } = build();

    await save('cv/main.tex', 'ban 1');
    await save('cv/main.tex', 'ban 2');

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('cho phép sửa hai lần rồi chặn lần thứ tư', async () => {
    const { save, write } = build();

    await save('cv/main.tex', 'ban 1');
    await save('cv/main.tex', 'ban 2');
    await save('cv/main.tex', 'ban 3');
    const thu4 = await save('cv/main.tex', 'ban 4');

    expect(write).toHaveBeenCalledTimes(3);
    expect(thu4.error).toContain('đủ rồi');
  });

  it('trần đếm theo TỪNG file, không dùng chung', async () => {
    const { save, write } = build();

    await save('cv/main.tex', 'a');
    await save('cv/main.tex', 'b');
    await save('cv/main.tex', 'c');
    const thu = await save('cover_letters/main.tex', 'a');

    expect(thu.saved).toBe('cover_letters/main.tex');
    expect(write).toHaveBeenCalledTimes(4);
  });

  it('bản bị chặn vẫn giữ nguyên artifact đã lưu trước đó', async () => {
    const { save, artifacts } = build();

    await save('cv/main.tex', 'ban 1');
    await save('cv/main.tex', 'ban 2');
    await save('cv/main.tex', 'ban 3');
    await save('cv/main.tex', 'ban 4');

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].bytes).toBe(Buffer.byteLength('ban 3'));
  });

  it('tên leo ra ngoài thì từ chối và không ghi gì', async () => {
    const { save, write } = build();

    const result = await save('../nguoi-b/cv.tex', 'trom');

    expect(result.error).toContain('không hợp lệ');
    expect(write).not.toHaveBeenCalled();
  });
});
