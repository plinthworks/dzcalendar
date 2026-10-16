/**
 * Reads before writes, once per frame. A measurement (`read`) never runs in
 * the middle of DOM writes, so a frame forces at most one layout. Tests use
 * `sync: true`, where `flush` runs at once.
 */
export interface Job<T> {
  read(): T;
  write(value: T): void;
}

export class FrameScheduler {
  private jobs: Job<unknown>[] = [];
  private frame = 0;

  constructor(private readonly win: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> | null, private readonly sync = false) {}

  schedule<T>(job: Job<T>): void {
    this.jobs.push(job as Job<unknown>);
    if (this.sync || !this.win) return this.flush();
    if (!this.frame) this.frame = this.win.requestAnimationFrame(() => this.flush());
  }

  flush(): void {
    this.frame = 0;
    const jobs = this.jobs.splice(0);
    const values = jobs.map((j) => j.read());
    jobs.forEach((j, i) => j.write(values[i]));
  }

  cancel(): void {
    if (this.frame && this.win) this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.jobs = [];
  }
}
