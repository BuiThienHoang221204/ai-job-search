export class FakeLiveTokens {
  readonly calls: Array<{ setup: Record<string, unknown>; expiresAt: Date }> =
    [];

  create(setup: Record<string, unknown>, expiresAt: Date): Promise<string> {
    this.calls.push({ setup, expiresAt });
    return Promise.resolve(`auth_tokens/gia-${this.calls.length}`);
  }

  reset(): void {
    this.calls.length = 0;
  }
}
