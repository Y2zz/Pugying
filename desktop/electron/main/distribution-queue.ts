import {
  DEFAULT_DISTRIBUTION_CONCURRENCY,
  isDistributionConcurrency,
} from "../../shared/distribution";

export interface DistributionTask {
  contentId: string;
  targetId: string;
  accountId: string;
}

/** 应用级队列；相同账号串行，互不相关的账号共享并发额度。 */
export class DistributionQueue {
  private concurrency = DEFAULT_DISTRIBUTION_CONCURRENCY;
  private waiting: DistributionTask[] = [];
  private running = new Map<
    string,
    { task: DistributionTask; promise: Promise<void> }
  >();
  private stopped = false;

  constructor(
    private readonly execute: (task: DistributionTask) => Promise<void>,
    private readonly onChange: () => void = () => undefined,
  ) {}

  snapshot() {
    const running = Array.from(this.running.values(), ({ task }) => ({
      ...task,
    }));
    const accounts = new Set(running.map((task) => task.accountId));
    return {
      running,
      waiting: this.waiting.map((task) => ({
        ...task,
        waitingReason: accounts.has(task.accountId)
          ? ("account" as const)
          : ("capacity" as const),
      })),
    };
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  setConcurrency(value: number): void {
    if (!isDistributionConcurrency(value)) {
      throw new Error("请输入大于零的整数");
    }
    this.concurrency = value;
    this.drain();
    this.onChange();
  }

  enqueue(tasks: DistributionTask[]): void {
    if (this.stopped) {
      throw new Error("应用正在退出");
    }
    for (const task of tasks) {
      if (
        !this.running.has(task.targetId) &&
        !this.waiting.some((item) => item.targetId === task.targetId)
      ) {
        this.waiting.push(task);
      }
    }
    this.drain();
    this.onChange();
  }

  stop(): DistributionTask[] {
    this.stopped = true;
    const tasks = [
      ...this.waiting,
      ...Array.from(this.running.values(), ({ task }) => task),
    ];
    this.waiting = [];
    this.onChange();
    return tasks;
  }

  async settled(): Promise<void> {
    await Promise.all(
      Array.from(this.running.values(), ({ promise }) => promise),
    );
  }

  private drain(): void {
    while (!this.stopped && this.running.size < this.concurrency) {
      const accounts = new Set(
        Array.from(this.running.values(), ({ task }) => task.accountId),
      );
      const index = this.waiting.findIndex(
        (task) => !accounts.has(task.accountId),
      );
      if (index < 0) {
        return;
      }
      const [task] = this.waiting.splice(index, 1);
      // 延迟到微任务，先登记任务，避免同步执行器在登记前完成。
      const promise = Promise.resolve()
        .then(() => this.execute(task))
        .catch((error: unknown) => {
          console.error(
            "[distribution] task failed:",
            error instanceof Error ? error.message : "unknown",
          );
        })
        .finally(() => {
          this.running.delete(task.targetId);
          this.drain();
          this.onChange();
        });
      this.running.set(task.targetId, { task, promise });
    }
  }
}
