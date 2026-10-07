import { DistributionQueue, type DistributionTask } from "./distribution-queue";

const task = (id: string, accountId = id): DistributionTask => ({
  contentId: "work",
  targetId: id,
  accountId,
});
const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

function fixture() {
  const finish = new Map<string, () => void>();
  const started: string[] = [];
  const queue = new DistributionQueue(
    (item) =>
      new Promise<void>((resolve) => {
        started.push(item.targetId);
        finish.set(item.targetId, resolve);
      }),
  );
  return { queue, finish, started };
}

it("reports account and capacity waits from detached snapshots and notifies on slot release", async () => {
  const finish = new Map<string, () => void>();
  const changed = vi.fn();
  const queue = new DistributionQueue(
    (item) =>
      new Promise<void>((resolve) => finish.set(item.targetId, resolve)),
    changed,
  );
  queue.setConcurrency(1);
  queue.enqueue([task("1", "same"), task("2", "same"), task("3", "other")]);
  await flush();
  const state = queue.snapshot();
  expect(
    state.waiting.map((item) => [item.targetId, item.waitingReason]),
  ).toEqual([
    ["2", "account"],
    ["3", "capacity"],
  ]);
  state.waiting[0].accountId = "changed-by-view";
  expect(queue.snapshot().waiting[0].accountId).toBe("same");
  changed.mockClear();
  finish.get("1")!();
  await flush();
  expect(queue.snapshot().running[0].targetId).toBe("2");
  expect(changed).toHaveBeenCalled();
  queue.stop();
  finish.forEach((resolve) => resolve());
  await queue.settled();
});

it("defaults to three concurrent tasks and advances the waiting queue", async () => {
  const { queue, finish, started } = fixture();
  queue.enqueue(["1", "2", "3", "4", "5"].map((id) => task(id)));
  await flush();
  expect(started).toEqual(["1", "2", "3"]);
  finish.get("2")!();
  await flush();
  expect(started).toEqual(["1", "2", "3", "4"]);
  queue.stop();
  finish.forEach((resolve) => resolve());
  await queue.settled();
});

it("serializes one account while allowing other accounts to fill the slots", async () => {
  const { queue, finish, started } = fixture();
  queue.enqueue([task("1", "same"), task("2", "same"), task("3"), task("4")]);
  await flush();
  expect(started).toEqual(["1", "3", "4"]);
  finish.get("1")!();
  await flush();
  expect(started).toEqual(["1", "3", "4", "2"]);
  queue.stop();
  finish.forEach((resolve) => resolve());
  await queue.settled();
});

it("applies a lower limit without interrupting tasks and increases it immediately", async () => {
  const { queue, finish, started } = fixture();
  queue.enqueue(["1", "2", "3", "4", "5"].map((id) => task(id)));
  await flush();
  queue.setConcurrency(1);
  finish.get("1")!();
  finish.get("2")!();
  await flush();
  expect(started).toEqual(["1", "2", "3"]);
  queue.setConcurrency(2);
  await flush();
  expect(started).toEqual(["1", "2", "3", "4"]);
  queue.stop();
  finish.forEach((resolve) => resolve());
  await queue.settled();
});

it("deduplicates targets and never starts waiting tasks after shutdown", async () => {
  const { queue, finish, started } = fixture();
  queue.setConcurrency(1);
  queue.enqueue([task("1"), task("1"), task("2")]);
  await flush();
  expect(
    queue
      .stop()
      .map((item) => item.targetId)
      .sort(),
  ).toEqual(["1", "2"]);
  finish.get("1")!();
  await queue.settled();
  expect(started).toEqual(["1"]);
  expect(() => queue.enqueue([task("3")])).toThrow("应用正在退出");
});

it.each([0, -1, 1.5, NaN, Infinity])(
  "rejects invalid concurrency %s",
  (value) => {
    expect(() =>
      new DistributionQueue(async () => undefined).setConcurrency(value),
    ).toThrow();
  },
);
