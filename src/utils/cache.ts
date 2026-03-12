interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;

  constructor(defaultTTLMs: number = 5 * 60 * 1000) {
    this.defaultTTL = defaultTTLMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
