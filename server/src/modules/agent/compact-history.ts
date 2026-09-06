import type { ModelMessage } from 'ai';

const HEAVY_TOOL = 'save_artifact';
const READ_BACK_TOOL = 'read_artifact';
const MIN_CHARS = 2000;

type ToolCallPart = {
  type: string;
  toolName?: string;
  input?: unknown;
};

const isHeavySaveCall = (part: unknown): part is ToolCallPart => {
  const candidate = part as ToolCallPart;
  if (candidate?.type !== 'tool-call' || candidate.toolName !== HEAVY_TOOL) {
    return false;
  }
  const input = candidate.input as { content?: unknown } | undefined;
  return (
    typeof input?.content === 'string' && input.content.length >= MIN_CHARS
  );
};

export function compactHistory(messages: ModelMessage[]): ModelMessage[] {
  let compacted = 0;

  const next = messages.map((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      return message;
    }

    const content = message.content.map((part) => {
      if (!isHeavySaveCall(part)) return part;

      compacted += 1;
      const input = part.input as { name?: string; content: string };
      return {
        ...part,
        input: {
          ...input,
          content: `<đã lưu ${input.content.length} ký tự vào "${input.name ?? 'file'}"; gọi ${READ_BACK_TOOL} để đọc lại khi cần sửa, ĐỪNG viết lại từ đầu>`,
        },
      };
    });

    return { ...message, content };
  });

  return compacted === 0 ? messages : next;
}
