import type { ModelMessage } from 'ai';
import type {
  Ai,
  AgentStepLog,
  GenerateObjectOptions,
  RunToolsOptions,
  RunToolsResult,
} from '../modules/ai/services/ai.service.js';

/**
 * Kết quả xếp sẵn cho một lần gọi: hoặc object mà model "trả về", hoặc lỗi để
 * thử nhánh thất bại.
 */
type Scripted = { object: unknown } | { error: Error };

/**
 * Một lượt chạy agent đã được viết sẵn kịch bản.
 *
 * Vòng lặp thật do model điều khiển, nên nếu test chỉ xếp sẵn câu trả lời cuối
 * thì nó không kiểm được thứ duy nhất đáng kiểm ở đây: agent có gọi ĐÚNG tool
 * với ĐÚNG tham số hay không. Vì vậy bản giả nhận cả danh sách lượt gọi tool,
 * tự chạy `execute` của chúng và ghi kết quả vào `steps` y như bản thật.
 */
export type ScriptedAgentRun = {
  /** Các tool sẽ được gọi, theo đúng thứ tự. */
  calls?: Array<{ tool: string; input: unknown }>;
  /** Câu trả lời cuối cùng của agent. */
  text: string;
  finishReason?: string;
};

export const FAKE_MODEL_ID = 'fake-model';

/** Bản giả của `AiService` cho test: không mạng, không tiền, không chờ. */
export class FakeAi implements Ai {
  /**
   * Nhật ký mọi lần gọi, để test khẳng định được "đã gọi đúng tác vụ với đúng
   * prompt" chứ không chỉ "có gọi".
   */
  readonly calls: Array<{
    purpose: string;
    userId?: string;
    system: string;
    prompt: string;
    modelId?: string;
  }> = [];

  private readonly scripted: Scripted[] = [];
  private readonly agentRuns: Array<
    { run: ScriptedAgentRun } | { error: Error }
  > = [];

  /** Xếp sẵn các object sẽ trả về, theo đúng thứ tự sẽ được gọi. */
  willReturn(...objects: unknown[]): this {
    for (const object of objects) this.scripted.push({ object });
    return this;
  }

  /** Xếp sẵn một lần gọi thất bại. */
  willFail(error: Error): this {
    this.scripted.push({ error });
    return this;
  }

  /** Xếp sẵn một lượt chạy agent: gọi tool nào, rồi kết luận ra sao. */
  willRunAgent(...runs: ScriptedAgentRun[]): this {
    for (const run of runs) this.agentRuns.push({ run });
    return this;
  }

  /** Xếp sẵn một lượt chạy agent thất bại. */
  willFailAgent(error: Error): this {
    this.agentRuns.push({ error });
    return this;
  }

  /**
   * Còn bao nhiêu kết quả chưa dùng. Test nên khẳng định về 0 ở cuối: còn dư
   * nghĩa là một nhánh đã không chạy như tưởng.
   */
  get pending(): number {
    return this.scripted.length + this.agentRuns.length;
  }

  /** Xoá nhật ký và các kết quả chưa dùng. */
  reset(): void {
    this.calls.length = 0;
    this.scripted.length = 0;
    this.agentRuns.length = 0;
  }

  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    await Promise.resolve();

    this.calls.push({
      purpose: options.context.purpose,
      userId: options.context.userId,
      system: options.system,
      prompt: options.prompt,
      modelId: options.modelId,
    });

    const next = this.scripted.shift();
    if (!next) {
      throw new Error(
        `FakeAi: lần gọi thứ ${this.calls.length} (${options.context.purpose}) không có kết quả xếp sẵn. ` +
          'Gọi willReturn()/willFail() trước, hoặc đây là một lần gọi model ngoài dự tính.',
      );
    }
    if ('error' in next) throw next.error;

    return {
      object: options.schema.parse(next.object),
      modelId: FAKE_MODEL_ID,
    };
  }

  /**
   * Chạy lại kịch bản đã xếp sẵn: gọi thật các tool được liệt kê, theo đúng thứ
   * tự, rồi trả về câu kết. Tool nào không được cấp thì ném lỗi ngay - đó là
   * cách test bắt được việc quên đăng ký một tool.
   */
  async runTools(options: RunToolsOptions): Promise<RunToolsResult> {
    this.calls.push({
      purpose: options.context.purpose,
      userId: options.context.userId,
      system: options.system,
      prompt: options.prompt ?? JSON.stringify(options.messages ?? []),
      modelId: options.modelId,
    });

    const next = this.agentRuns.shift();
    if (!next) {
      throw new Error(
        `FakeAi: lượt chạy agent thứ ${this.calls.length} (${options.context.purpose}) không có kịch bản xếp sẵn. ` +
          'Gọi willRunAgent() trước, hoặc đây là một lượt chạy ngoài dự tính.',
      );
    }
    if ('error' in next) throw next.error;

    const steps: AgentStepLog[] = [];
    // Bản giả cũng phải tích luỹ hội thoại, nếu không test không kiểm được
    // đường chạy tiếp - vốn dựa hoàn toàn vào ảnh chụp này.
    const conversation: ModelMessage[] = [
      { role: 'user', content: options.prompt ?? '' },
    ];

    for (const [index, call] of (next.run.calls ?? []).entries()) {
      const tool = options.tools[call.tool] as
        | { execute?: (input: unknown, extra: unknown) => Promise<unknown> }
        | undefined;
      if (!tool?.execute) {
        throw new Error(
          `FakeAi: kịch bản gọi tool "${call.tool}" nhưng lượt chạy này không được cấp tool đó.`,
        );
      }

      const output = await tool.execute(call.input, {
        toolCallId: `fake-${index}`,
        messages: [],
      });

      conversation.push({
        role: 'assistant',
        content: `[tool ${call.tool}] ${JSON.stringify(output)}`,
      });

      const step: AgentStepLog = {
        index,
        text: '',
        toolCalls: [{ tool: call.tool, input: call.input }],
        toolResults: [{ tool: call.tool, output }],
        durationMs: 0,
        messages: [...conversation],
      };
      steps.push(step);
      await options.onStep?.(step);

      /*
       * Bắt chước `stopWhen: hasToolCall(...)` của SDK thật: vòng lặp dừng NGAY
       * sau bước gọi tool đó, nên bước cuối cùng là chính bước ấy chứ không
       * phải một câu kết. `AgentRunnerService` đọc đúng bước cuối để biết agent
       * có đang chờ người dùng hay không, nên sai chỗ này thì bản giả sẽ báo
       * "xong" trong khi bản thật báo "đang chờ".
       */
      if (options.stopOnTool && call.tool === options.stopOnTool) {
        return {
          text: '',
          steps,
          finishReason: 'tool-calls',
          modelId: FAKE_MODEL_ID,
          messages: [...conversation],
        };
      }
    }

    conversation.push({ role: 'assistant', content: next.run.text });

    const final: AgentStepLog = {
      index: steps.length,
      text: next.run.text,
      toolCalls: [],
      toolResults: [],
      durationMs: 0,
      messages: [...conversation],
    };
    steps.push(final);
    await options.onStep?.(final);

    return {
      text: next.run.text,
      steps,
      finishReason: next.run.finishReason ?? 'stop',
      modelId: FAKE_MODEL_ID,
      messages: [...conversation],
    };
  }
}
