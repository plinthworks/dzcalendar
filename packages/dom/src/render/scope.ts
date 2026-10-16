/**
 * Everything a calendar sets up and must take down: listeners, timers,
 * observers, subscriptions. `dispose()` releases them all, once — so
 * `destroy()` cannot forget one as views, popovers and interactions add theirs.
 */
export class Scope {
  private readonly cleanups: (() => void)[] = [];
  private disposed = false;

  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  }

  timeout(fn: () => void, ms: number): void {
    const id = setTimeout(fn, ms);
    this.add(() => clearTimeout(id));
  }

  add(cleanup: () => void): void {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
  }

  dispose(): void {
    this.disposed = true;
    for (const fn of this.cleanups.splice(0).reverse()) {
      try {
        fn();
      } catch (err) {
        void Promise.reject(err);
      }
    }
  }
}
