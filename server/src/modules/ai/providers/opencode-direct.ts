import { extractJsonFromResponse } from '../utils/json-text';
import { extractJsonFromStream } from '../utils/json-stream';
import { getOrCreateSessionId } from '../utils/opencode-session';
import { parseSSEToResponse } from '../utils/sse-to-json';
import type { ProviderDescriptor } from './types';

const OPENCODE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read',
      description:
        'Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory to read' },
          offset: {
            type: 'integer',
            minimum: 0,
            description:
              'The line or directory entry to start reading from (1-based)',
          },
          limit: {
            type: 'integer',
            minimum: 0,
            description:
              'The maximum number of lines or directory entries to read (defaults to and capped at 2000)',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'shell',
      description:
        'Execute a shell command and return its output. Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command string to execute',
          },
          workdir: {
            type: 'string',
            description:
              'Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead.',
          },
          timeout: {
            type: 'integer',
            minimum: 0,
            description:
              'Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default.',
          },
          background: {
            type: 'boolean',
            description:
              "Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion.",
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
];

const PLACEHOLDER_NOTE =
  'Do not call the `read` or `shell` tools; they are placeholders that do nothing.';

function transformBody(bodyText: string): {
  body: string;
  isClientStreaming: boolean;
} {
  const parsed = JSON.parse(bodyText) as Record<string, unknown>;
  const isClientStreaming = Boolean(parsed.stream);
  parsed.stream = true;
  parsed.tools = OPENCODE_TOOLS;

  const messages = Array.isArray(parsed.messages)
    ? (parsed.messages as Array<Record<string, unknown>>)
    : [];
  const first = messages[0];
  if (first?.role === 'system' && typeof first.content === 'string') {
    parsed.messages = [
      { ...first, content: `${first.content}\n\n${PLACEHOLDER_NOTE}` },
      ...messages.slice(1),
    ];
  } else {
    parsed.messages = [
      { role: 'system', content: PLACEHOLDER_NOTE },
      ...messages,
    ];
  }

  return { body: JSON.stringify(parsed), isClientStreaming };
}

export const opencodeDirect: ProviderDescriptor = {
  id: 'opencode-direct',
  label: 'OpenCode Direct',
  apiKeyEnv: 'OPENCODE_DIRECT_API_KEY',
  baseURLEnv: 'OPENCODE_DIRECT_BASE_URL',
  honorsResponseFormat: false,
  streamsJson: 'all',
  knownNoStructuredOutput: ['laguna-s-2.1-free', 'ling-3.0-tiny-free'],
  filterModel: (id) => id.endsWith('-free') || id === 'big-pickle',
  customFetch: async (originalFetch, input, init, context) => {
    const headers = new Headers(init?.headers);
    const session = getOrCreateSessionId(context.resolved.model.id);

    headers.set('User-Agent', 'opencode/latest/2.0.26/cli');
    headers.set('x-opencode-client', 'cli');
    headers.set('x-opencode-project', 'global');
    headers.set('x-opencode-session', session);
    headers.set('x-opencode-session-id', session);
    headers.set('x-session-affinity', session);
    headers.set('x-session-id', session);
    if (context.resolved.apiKey) {
      headers.set('Authorization', `Bearer ${context.resolved.apiKey}`);
    }

    const { body, isClientStreaming } = transformBody(init?.body as string);
    const response = await originalFetch(input, { ...init, headers, body });
    if (!response.ok) return response;

    if (!isClientStreaming) {
      const text = await response.text();
      return extractJsonFromResponse(parseSSEToResponse(text));
    }

    const unwrapped = await extractJsonFromResponse(response);
    return context.jsonStream ? extractJsonFromStream(unwrapped) : unwrapped;
  },
};
