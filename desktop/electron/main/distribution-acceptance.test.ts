import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.PUGYING_ACCEPTANCE_DATA_DIR },
}));
vi.mock("./server-process", () => ({
  getApiBaseUrl: () => process.env.PUGYING_ACCEPTANCE_API_URL,
  getLocalApiToken: () => "acceptance-local-token",
}));

const videoAdapter = vi.hoisted(() => ({
  gate: undefined as Promise<void> | undefined,
}));

// 仅测试边界替换平台适配器；生产代码不提供模拟发布开关。
vi.mock("./platforms/publish-douyin-http", () => ({
  runDouyinHttpPublish: vi.fn(async ({ payload, signal, onProgress }) => {
    const identity = {
      requestId: payload.requestId,
      targetId: payload.targetId,
      platform: payload.platform,
    };
    await videoAdapter.gate;
    for (const phase of ["accepted", "uploading", "submitting", "done"]) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (signal.cancelled) {
        return { ...identity, ok: false, errorCode: "cancelled" };
      }
      onProgress({ ...identity, phase });
    }
    return {
      ...identity,
      ok: true,
      platformPostId: "123",
      platformUrl: "https://www.douyin.com/video/123",
    };
  }),
}));

type Target = {
  id: string;
  platformAccountId: string;
  publishStatus: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
};
type Work = { id: string; targets: Target[] };
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Opt-in: starts the built Server against an isolated database; no real accounts or platform requests.
describe.skipIf(process.env.PUGYING_RUN_DISTRIBUTION_ACCEPTANCE !== "1")(
  "distribution acceptance with real API and SQLite",
  () => {
    let directory: string;
    let child: ChildProcess;
    let apiUrl: string;
    let accounts: string[];
    let service: typeof import("./distribution-service");
    const oldDirectory = process.env.PUGYING_ACCEPTANCE_DATA_DIR;
    const oldUrl = process.env.PUGYING_ACCEPTANCE_API_URL;
    const dispatchIds = new Set<string>();

    async function api<T>(path: string, body?: unknown): Promise<T> {
      const response = await fetch(`${apiUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pugying-Local-Token": "acceptance-local-token",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    }

    async function createWork(
      selected: string[],
      mediaPath = join(directory, "video.mp4"),
    ): Promise<Work> {
      const work = await api<Work>("/contents", {
        type: "video",
        title: "分发验收作品",
        mediaPaths: [mediaPath],
        targets: selected.map((platformAccountId) => ({ platformAccountId })),
      });
      work.targets.forEach((target) => dispatchIds.add(target.id));
      return work;
    }

    async function waitForWork(
      id: string,
      predicate: (work: Work) => boolean,
    ): Promise<Work> {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const work = await api<Work>(`/contents/${id}`);
        if (predicate(work)) {
          return work;
        }
        await pause(10);
      }
      throw new Error("分发状态等待超时");
    }

    function peak(targets: Target[]): number {
      const events = targets.flatMap((target) =>
        target.startedAt && target.finishedAt
          ? [
              { time: Date.parse(target.startedAt), delta: 1 },
              { time: Date.parse(target.finishedAt), delta: -1 },
            ]
          : [],
      );
      events.sort((a, b) => a.time - b.time || a.delta - b.delta);
      let running = 0;
      let maximum = 0;
      for (const event of events) {
        running += event.delta;
        maximum = Math.max(maximum, running);
      }
      return maximum;
    }

    beforeAll(async () => {
      directory = await mkdtemp(
        join(tmpdir(), "pugying-distribution-acceptance-"),
      );
      await writeFile(
        join(directory, "video.mp4"),
        "stub media, never uploaded",
      );
      process.env.PUGYING_ACCEPTANCE_DATA_DIR = directory;
      const port = await new Promise<number>((done, reject) => {
        const listener = createServer();
        listener.on("error", reject);
        listener.listen(0, "127.0.0.1", () => {
          const address = listener.address();
          const value =
            typeof address === "object" && address ? address.port : 0;
          listener.close(() => done(value));
        });
      });
      apiUrl = `http://127.0.0.1:${port}`;
      process.env.PUGYING_ACCEPTANCE_API_URL = apiUrl;
      child = spawn(process.execPath, ["dist/src/main.js"], {
        cwd: resolve("../server"),
        env: {
          ...process.env,
          PORT: String(port),
          PUGYING_DATABASE_PATH: join(directory, "acceptance.db"),
          PLATFORM_CREDENTIAL_SECRET: "acceptance-only-secret",
          PUGYING_LOCAL_API_TOKEN: "acceptance-local-token",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout?.on("data", (bytes) => {
        output = (output + bytes.toString()).slice(-8000);
      });
      child.stderr?.on("data", (bytes) => {
        output = (output + bytes.toString()).slice(-8000);
      });
      let ready = false;
      for (let i = 0; i < 100; i += 1) {
        try {
          const response = await fetch(`${apiUrl}/api-json`);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          /* wait for the isolated Server */
        }
        if (child.exitCode !== null) {
          break;
        }
        await pause(100);
      }
      if (!ready) {
        throw new Error(`验收 Server 未启动：${output}`);
      }
      accounts = [];
      for (let i = 0; i < 9; i += 1) {
        const account = await api<{ id: string }>("/platform-accounts", {
          platform: "douyin",
          displayName: `验收账号 ${i + 1}`,
          platformUserId: `acceptance-${i}`,
          cookies: [
            { name: "sessionid", value: `fake-${i}`, domain: ".douyin.com" },
          ],
        });
        accounts.push(account.id);
      }
    }, 20000);

    beforeEach(async () => {
      vi.resetModules();
      service = await import("./distribution-service");
      await service.recoverInterruptedDistributions();
      await service.updateDistributionConcurrency(3);
    });

    afterEach(async () => {
      await service?.stopDistributions();
    });
    afterAll(async () => {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise<void>((done) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            done();
          }, 3000);
          child.once("exit", () => {
            clearTimeout(timer);
            done();
          });
        });
      }
      for (const id of dispatchIds) {
        await rm(join(tmpdir(), `pugying-dispatch-${id}`), {
          recursive: true,
          force: true,
        });
      }
      if (directory) {
        await rm(directory, { recursive: true, force: true });
      }
      for (const [key, value] of [
        ["PUGYING_ACCEPTANCE_DATA_DIR", oldDirectory],
        ["PUGYING_ACCEPTANCE_API_URL", oldUrl],
      ]) {
        if (value === undefined) {
          delete process.env[key!];
        } else {
          process.env[key!] = value;
        }
      }
    });

    it("defaults to 3 and retains a user choice after recreating the main service", async () => {
      expect(service.getDistributionConcurrency()).toBe(3);
      await service.updateDistributionConcurrency(5);
      vi.resetModules();
      service = await import("./distribution-service");
      expect(service.getDistributionConcurrency()).toBe(5);
      await expect(service.updateDistributionConcurrency(0)).rejects.toThrow();
      await expect(
        service.updateDistributionConcurrency(1.5),
      ).rejects.toThrow();
    });

    it("runs nine targets with a real peak of three and saves every outcome without any renderer", async () => {
      const work = await createWork(accounts);
      const accepted = await service.submitDistribution({ contentId: work.id });
      expect(accepted.ok).toBe(true);
      const completed = await waitForWork(work.id, (item) =>
        item.targets.every((target) => target.publishStatus === "succeeded"),
      );
      expect(peak(completed.targets)).toBe(3);
      expect(
        completed.targets.every(
          (target) => target.startedAt && target.finishedAt,
        ),
      ).toBe(true);
    });

    it('observes cross-work active and waiting tasks through the real read API and recovers their latest results after reload', async () => {
      await service.updateDistributionConcurrency(1);
      const first = await createWork([accounts[0], accounts[1], accounts[2]]);
      let second!: Work;
      let release!: () => void;
      videoAdapter.gate = new Promise<void>((done) => { release = done; });
      try {
        await service.submitDistribution({ contentId: first.id });
        await waitForWork(first.id, (work) => work.targets.some((target) => target.publishStatus === 'running'));
        // API 返回的 Target 顺序不固定；使用实际占用的账号验证串行等待。
        const running = service.getDistributionSnapshot().tasks.find((task) => task.contentId === first.id && task.state === 'running');
        expect(running).toBeDefined();
        second = await createWork([running!.accountId, accounts[3]]);
        await service.submitDistribution({ contentId: second.id });
        const live = service.getDistributionSnapshot();
        expect(live.tasks.some((task) => task.state === 'waiting' && task.waitingReason === 'account')).toBe(true);
        expect(live.tasks.some((task) => task.state === 'waiting' && task.waitingReason === 'capacity')).toBe(true);
        const waiting = await api<{ items: Array<{ contentId: string; accountName: string }>; counts: { active: number; waiting: number } }>('/contents/distribution?view=waiting&pageSize=100');
        expect(new Set(waiting.items.map((item) => item.contentId))).toEqual(new Set([first.id, second.id]));
        expect(waiting.counts.active).toBe(1);
        expect(waiting.counts.waiting).toBe(4);
        expect(waiting.items.every((item) => item.accountName.startsWith('验收账号'))).toBe(true);
        expect(JSON.stringify(waiting)).not.toContain('cookies');
        expect(JSON.stringify(waiting)).not.toContain('credentialCipher');
      } finally {
        videoAdapter.gate = undefined;
        release();
      }
      await waitForWork(second.id, (work) => work.targets.every((target) => target.publishStatus === 'succeeded'));
      await waitForWork(first.id, (work) => work.targets.every((target) => target.publishStatus === 'succeeded'));
      const complete = await api<{ items: Array<{ contentId: string; platformUrl: string }>; counts: { active: number; waiting: number } }>('/contents/distribution?view=completed&pageSize=100');
      expect(complete.items.filter((item) => [first.id, second.id].includes(item.contentId))).toHaveLength(5);
      expect(complete.counts.active).toBe(0);
      expect(complete.counts.waiting).toBe(0);
      vi.resetModules();
      service = await import('./distribution-service');
      await service.recoverInterruptedDistributions();
      expect(service.getDistributionSnapshot().tasks).toEqual([]);
      expect((await api<{ items: Array<{ contentId: string }> }>('/contents/distribution?view=completed&pageSize=100')).items.filter((item) => [first.id, second.id].includes(item.contentId))).toHaveLength(5);
    });

    it("raises the limit to a user-selected five concurrent targets", async () => {
      await service.updateDistributionConcurrency(1);
      const work = await createWork(accounts);
      await service.submitDistribution({ contentId: work.id });
      await waitForWork(work.id, (item) =>
        item.targets.some((target) => target.publishStatus === "running"),
      );
      await service.updateDistributionConcurrency(5);
      const completed = await waitForWork(work.id, (item) =>
        item.targets.every((target) => target.publishStatus === "succeeded"),
      );
      expect(peak(completed.targets)).toBe(5);
    });

    it("lowers the limit without cancelling active work and serializes subsequent tasks", async () => {
      const work = await createWork(accounts.slice(0, 7));
      const accepted = await service.submitDistribution({ contentId: work.id });
      await waitForWork(
        work.id,
        (item) =>
          item.targets.filter((target) => target.publishStatus === "running")
            .length === 3,
      );
      await service.updateDistributionConcurrency(1);
      const completed = await waitForWork(work.id, (item) =>
        item.targets.every((target) => target.publishStatus === "succeeded"),
      );
      if (!accepted.ok) {
        throw new Error(accepted.message);
      }
      const waiting = completed.targets.filter(
        (target) => accepted.targetIds.indexOf(target.id) >= 3,
      );
      expect(peak(waiting)).toBe(1);
      expect(
        completed.targets.some(
          (target) => target.publishStatus === "cancelled",
        ),
      ).toBe(false);
    });

    it("shares slots across works and serializes the same media account", async () => {
      const first = await createWork([accounts[0], accounts[1]]);
      const second = await createWork([accounts[0], accounts[2]]);
      await service.submitDistribution({ contentId: first.id });
      await service.submitDistribution({ contentId: second.id });
      const [a, b] = await Promise.all(
        [first, second].map((work) =>
          waitForWork(work.id, (item) =>
            item.targets.every(
              (target) => target.publishStatus === "succeeded",
            ),
          ),
        ),
      );
      const earlier = a.targets.find(
        (target) => target.platformAccountId === accounts[0],
      )!;
      const later = b.targets.find(
        (target) => target.platformAccountId === accounts[0],
      )!;
      expect(Date.parse(later.startedAt!)).toBeGreaterThanOrEqual(
        Date.parse(earlier.finishedAt!),
      );
      expect(peak([...a.targets, ...b.targets])).toBe(3);
    });

    it("records a missing queued source as failed and continues unrelated work", async () => {
      await service.updateDistributionConcurrency(1);
      const missing = join(directory, "missing.mp4");
      await writeFile(missing, "stub");
      const first = await createWork([accounts[0]]);
      const bad = await createWork([accounts[1]], missing);
      const good = await createWork([accounts[2]]);
      await service.submitDistribution({ contentId: first.id });
      await service.submitDistribution({ contentId: bad.id });
      await rm(missing);
      await service.submitDistribution({ contentId: good.id });
      const failed = await waitForWork(
        bad.id,
        (item) => item.targets[0].publishStatus === "failed",
      );
      expect(failed.targets[0].errorCode).toBe("MEDIA_MISSING");
      await waitForWork(
        good.id,
        (item) => item.targets[0].publishStatus === "succeeded",
      );
    });

    it("stops active and waiting tasks and reconciles abandoned queued states on restart", async () => {
      const work = await createWork(accounts.slice(0, 6));
      await service.submitDistribution({ contentId: work.id });
      await waitForWork(
        work.id,
        (item) =>
          item.targets.filter((target) => target.publishStatus === "running")
            .length === 3,
      );
      await service.stopDistributions();
      const cancelled = await api<Work>(`/contents/${work.id}`);
      expect(
        cancelled.targets.every(
          (target) => target.publishStatus === "cancelled",
        ),
      ).toBe(true);
      const abandoned = await createWork([accounts[0]]);
      await api(`/contents/${abandoned.id}/publish`, {});
      vi.resetModules();
      service = await import("./distribution-service");
      await service.recoverInterruptedDistributions();
      expect(
        (await api<Work>(`/contents/${abandoned.id}`)).targets[0].publishStatus,
      ).toBe("cancelled");
    });
  },
);
