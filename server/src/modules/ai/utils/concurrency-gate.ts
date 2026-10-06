export class ConcurrencyGate {
  private readonly limits = new Map<string, number>();
  private readonly active = new Map<string, number>();
  private readonly waiters = new Map<string, Array<() => void>>();

  constructor(limits: Record<string, number | undefined>) {
    for (const [id, limit] of Object.entries(limits)) {
      if (limit && limit > 0) this.limits.set(id, limit);
    }
  }

  async acquire(providerId: string): Promise<() => void> {
    const limit = this.limits.get(providerId);
    if (!limit) return () => {};

    await this.wait(providerId, limit);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(providerId);
    };
  }

  private wait(providerId: string, limit: number): Promise<void> {
    const current = this.active.get(providerId) ?? 0;
    if (current < limit) {
      this.active.set(providerId, current + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = this.waiters.get(providerId) ?? [];
      queue.push(resolve);
      this.waiters.set(providerId, queue);
    });
  }

  private release(providerId: string): void {
    const next = this.waiters.get(providerId)?.shift();
    if (next) {
      next();
      return;
    }
    const current = this.active.get(providerId) ?? 0;
    this.active.set(providerId, Math.max(0, current - 1));
  }
}
