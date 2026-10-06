export const SANDBOX = Symbol('SANDBOX');

export type SandboxSpec = {
  image: string;

  files: Record<string, string | Buffer>;

  command: string[];

  timeoutMs: number;

  artifacts: string[];

  network?: 'none' | 'egress';

  limits?: {
    memoryMb?: number;
    cpus?: number;
  };
};

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  artifacts: Record<string, Buffer>;
};

export type SandboxErrorKind =
  'TIMEOUT' | 'RUNTIME_UNAVAILABLE' | 'IMAGE_MISSING' | 'OTHER';

export class SandboxError extends Error {
  constructor(
    readonly kind: SandboxErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

export interface SandboxRunner {
  run(spec: SandboxSpec): Promise<SandboxResult>;

  available(): Promise<boolean>;
}
