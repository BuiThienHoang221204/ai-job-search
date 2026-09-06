import {
  saveCoverLetterTool,
  saveCvTool,
} from 'src/modules/agent/tools/save-document.tool.js';
import type {
  ArtifactRecord,
  ToolDeps,
} from 'src/modules/agent/agent.types.js';
import { cvSchema } from 'src/modules/documents/document.schema.js';

const CONTEXT = { runId: 'run-1', userId: 'nguoi-a', jobId: 'job-1' };

const OPTIONS = { toolCallId: 'x', messages: [] } as never;

const CV_CONTENT = {
  profileStatement: 'Kế toán tổng hợp bốn năm kinh nghiệm ngành sản xuất.',
  coreCompetencies: ['Lập báo cáo tài chính', 'Misa', 'Quyết toán thuế'],
  experiences: [
    {
      position: 'Kế toán tổng hợp',
      company: 'Công ty Minh Long',
      location: 'Bình Dương',
      period: '01/2022 - 06/2025',
      bullets: ['Lập báo cáo tài chính hằng quý cho ba đơn vị thành viên.'],
    },
  ],
  projects: [],
  educations: [
    {
      degree: 'Cử nhân Kế toán',
      school: 'Đại học Kinh tế TP.HCM',
      period: '2016 - 2020',
      note: '',
    },
  ],
  skills: [{ group: 'Phần mềm', items: ['Misa', 'Excel'] }],
};

const LETTER_CONTENT = {
  salutation: 'Kính gửi Bộ phận Tuyển dụng',
  opening: 'Tôi ứng tuyển vị trí Kế toán tổng hợp.',
  bodyParagraphs: ['Bốn năm làm báo cáo tài chính ngành sản xuất.'],
  motivation: 'Minh Long là nơi tôi muốn gắn bó vì quy mô ba nhà máy.',
  closing: 'Mong được trao đổi thêm.',
};

type SaveResult = { documentId?: string; saved?: string; error?: string };

const build = (options: { fail?: boolean } = {}) => {
  const saveFromAgent = jest.fn<Promise<unknown>, [unknown]>(() =>
    options.fail
      ? Promise.reject(new Error('render hỏng'))
      : Promise.resolve({ id: 'doc-1', storageKey: 'nguoi-a/cv/main.tex' }),
  );
  const artifacts: ArtifactRecord[] = [];
  const deps = { documents: { saveFromAgent } } as unknown as ToolDeps;

  return {
    artifacts,
    saveFromAgent,
    cv: saveCvTool(deps, CONTEXT, artifacts),
    letter: saveCoverLetterTool(deps, CONTEXT, artifacts),
  };
};

describe('save_cv', () => {
  it('tạo Document gắn với lượt chạy và công việc', async () => {
    const { cv, saveFromAgent, artifacts } = build();

    const result = (await cv.execute(
      { title: 'CV — Kế toán', content: CV_CONTENT },
      OPTIONS,
    )) as SaveResult;

    expect(result.documentId).toBe('doc-1');
    expect(saveFromAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'nguoi-a',
        agentRunId: 'run-1',
        jobId: 'job-1',
        kind: 'CV',
      }),
    );
    expect(artifacts[0]).toMatchObject({ documentId: 'doc-1', kind: 'CV' });
  });

  it('chặn lần lưu thứ ba', async () => {
    const { cv, saveFromAgent } = build();
    const call = () =>
      cv.execute(
        { title: 'CV', content: CV_CONTENT },
        OPTIONS,
      ) as Promise<SaveResult>;

    await call();
    await call();
    const third = await call();

    expect(saveFromAgent).toHaveBeenCalledTimes(2);
    expect(third.error).toContain('đủ rồi');
  });

  it('lưu hỏng thì báo lỗi chứ không ném ra vòng lặp agent', async () => {
    const { cv } = build({ fail: true });

    const result = (await cv.execute(
      { title: 'CV', content: CV_CONTENT },
      OPTIONS,
    )) as SaveResult;

    expect(result.error).toContain('render hỏng');
  });

  it('CV thiếu năng lực thì schema chặn ngay, không tạo Document', () => {
    const parsed = cvSchema('vi').safeParse({
      ...CV_CONTENT,
      coreCompetencies: ['Chỉ một'],
    });

    expect(parsed.success).toBe(false);
  });
});

describe('save_cover_letter', () => {
  it('lưu thành COVER_LETTER, đếm riêng với CV', async () => {
    const { cv, letter, saveFromAgent } = build();

    await cv.execute({ title: 'CV', content: CV_CONTENT }, OPTIONS);
    await cv.execute({ title: 'CV', content: CV_CONTENT }, OPTIONS);
    const result = (await letter.execute(
      { title: 'Thư', content: LETTER_CONTENT },
      OPTIONS,
    )) as SaveResult;

    expect(result.error).toBeUndefined();
    expect(saveFromAgent).toHaveBeenCalledTimes(3);
    expect(saveFromAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'COVER_LETTER' }),
    );
  });
});
