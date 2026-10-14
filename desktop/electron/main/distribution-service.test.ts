import type {
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "./publish-protocol";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  setConcurrency: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  invalid: vi.fn(),
}));
vi.mock("./account-session", () => ({
  findInvalidAccounts: mocks.invalid,
}));
vi.mock("./publish-job", () => ({
  startPublishJob: mocks.start,
  cancelPublishJob: mocks.cancel,
  setPublishConcurrency: mocks.setConcurrency,
}));
vi.mock("./distribution-settings", () => ({
  readDistributionConcurrency: mocks.read,
  saveDistributionConcurrency: mocks.save,
}));
vi.mock("./server-process", () => ({
  getApiBaseUrl: () => "http://127.0.0.1:3928",
  getLocalApiToken: () => "local-test-token",
}));

let api: ReturnType<typeof vi.fn>;
let results: Map<string, (result: PlatformPublishResultPayload) => void>;
const dispatch = (id: string) => ({
  targetId: id,
  accountId: id,
  platform: "douyin",
  title: "作品",
  coverPath: "",
  cookies: [],
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const flush = async () => {
  for (let i = 0; i < 40; i += 1) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.read.mockReturnValue(3);
  mocks.invalid.mockResolvedValue([]);
  mocks.save.mockResolvedValue(undefined);
  results = new Map();
  mocks.start.mockImplementation(
    (options: {
      payload: PlatformPublishStartPayload;
      onResult: (result: PlatformPublishResultPayload) => void;
    }) => {
      results.set(options.payload.targetId, options.onResult);
      return { ok: true };
    },
  );
  mocks.cancel.mockImplementation((requestId: string) => {
    const call = mocks.start.mock.calls.find(
      ([options]) => options.payload.requestId === requestId,
    );
    if (call) {
      call[0].onResult({
        requestId,
        targetId: call[0].payload.targetId,
        ok: false,
        errorCode: "cancelled",
      });
    }
    return true;
  });
  api = vi.fn(async (url: string) => {
    if (url.endsWith("/publish")) {
      return json({ dispatches: ["1", "2", "3", "4"].map(dispatch) });
    }
    if (url.endsWith("/retry")) {
      return json({ dispatch: dispatch("retry") });
    }
    if (url.endsWith("/start")) {
      return json({ dispatch: dispatch(url.split("/").at(-2)!) });
    }
    return json({});
  });
  vi.stubGlobal("fetch", api);
});

afterEach(async () => {
  const service = await import("./distribution-service");
  await service.stopDistributions();
  results.forEach((resolve, targetId) =>
    resolve({ requestId: targetId, targetId, ok: false }),
  );
  await flush();
  vi.unstubAllGlobals();
});

it("exposes safe live progress to refreshed observers and keeps saving results distinct from publishing", async () => {
  const service = await import("./distribution-service");
  const notified = vi.fn();
  const unsubscribe = service.observeDistributions(notified);
  const broken = service.observeDistributions(() => {
    throw new Error("closed view");
  });
  await service.submitDistribution({ contentId: "work" });
  await flush();
  expect(
    service
      .getDistributionSnapshot()
      .tasks.filter((task) => task.state === "running"),
  ).toHaveLength(3);
  expect(
    service
      .getDistributionSnapshot()
      .tasks.find((task) => task.targetId === "4"),
  ).toMatchObject({ state: "waiting", waitingReason: "capacity" });
  const options = mocks.start.mock.calls[0][0];
  options.onProgress({
    ...options.payload,
    phase: "uploading",
    message: "private platform debug data",
    percent: 37,
    speedBps: 1_500_000,
  });
  const snapshot = service.getDistributionSnapshot();
  expect(snapshot.tasks.find((task) => task.targetId === "1")).toMatchObject({
    phase: "uploading",
    uploadPercent: 37,
    uploadSpeedBps: 1_500_000,
  });
  options.onProgress({
    ...options.payload,
    phase: "uploading",
    message: "处理封面",
  });
  expect(service.getDistributionSnapshot().tasks.find((task) => task.targetId === "1")).toMatchObject({
    phase: "uploading",
    uploadPercent: undefined,
    uploadSpeedBps: undefined,
  });
  expect(JSON.stringify(snapshot)).not.toContain("private platform debug data");
  expect(JSON.stringify(snapshot)).not.toContain("cookies");
  expect(notified).toHaveBeenCalled();
  const save = Promise.withResolvers<Response>();
  api.mockImplementationOnce(() => save.promise);
  results.get("1")!({ requestId: "1", targetId: "1", ok: true });
  await flush();
  expect(
    service
      .getDistributionSnapshot()
      .tasks.find((task) => task.targetId === "1")?.state,
  ).toBe("saving");
  expect(
    service
      .getDistributionSnapshot()
      .tasks.find((task) => task.targetId === "4")?.state,
  ).toBe("waiting");
  save.resolve(json({}));
  await flush();
  expect(
    service
      .getDistributionSnapshot()
      .tasks.some((task) => task.targetId === "1"),
  ).toBe(false);
  unsubscribe();
  broken();
});

it("accepts all targets before completion and saves outcomes without a renderer", async () => {
  const service = await import("./distribution-service");
  expect(await service.submitDistribution({ contentId: "work" })).toEqual({
    ok: true,
    targetIds: ["1", "2", "3", "4"],
  });
  await flush();
  expect([...results.keys()]).toEqual(["1", "2", "3"]);
  results.get("2")!({
    requestId: "2",
    targetId: "2",
    ok: true,
    platformUrl: "https://www.douyin.com/video/2",
  });
  await flush();
  expect([...results.keys()]).toEqual(["1", "2", "3", "4"]);
  expect(api).toHaveBeenCalledWith(
    "http://127.0.0.1:3928/contents/work/targets/2/complete",
    expect.objectContaining({
      headers: expect.objectContaining({
        "X-Pugying-Local-Token": "local-test-token",
      }),
      body: JSON.stringify({
        ok: true,
        platformUrl: "https://www.douyin.com/video/2",
      }),
    }),
  );
});

it("retries a selected target through the same scheduler", async () => {
  const service = await import("./distribution-service");
  expect(
    await service.submitDistribution({ contentId: "work", targetId: "retry" }),
  ).toEqual({ ok: true, targetIds: ["retry"] });
  await flush();
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      payload: expect.objectContaining({ targetId: "retry" }),
    }),
  );
});

it("continues other targets when an adapter rejects one task", async () => {
  const service = await import("./distribution-service");
  mocks.start.mockReturnValueOnce({ error: "unsupported_platform" });
  await service.submitDistribution({ contentId: "work" });
  await flush();
  expect(mocks.start).toHaveBeenCalledTimes(4);
  expect(
    api.mock.calls.some(
      ([url, init]) =>
        url.endsWith("/1/complete") &&
        JSON.parse(init.body).errorCode === "unsupported_platform",
    ),
  ).toBe(true);
});

it("stops queued work and records interrupted targets before the server shuts down", async () => {
  const service = await import("./distribution-service");
  await service.submitDistribution({ contentId: "work" });
  await flush();
  await service.stopDistributions();
  expect(mocks.cancel).toHaveBeenCalledTimes(3);
  expect(
    api.mock.calls.filter(([url]) => url.endsWith("/cancel")),
  ).toHaveLength(4);
  results.get("1")!({ requestId: "1", targetId: "1", ok: false });
  await flush();
  expect(mocks.start).toHaveBeenCalledTimes(3);
  expect((await service.submitDistribution({ contentId: "later" })).ok).toBe(
    false,
  );
});

it("persists valid settings and applies them only after saving", async () => {
  const service = await import("./distribution-service");
  expect(service.getDistributionConcurrency()).toBe(3);
  await expect(service.updateDistributionConcurrency(5)).resolves.toBe(5);
  expect(mocks.save).toHaveBeenCalledWith(expect.any(String), 5);
  expect(service.getDistributionConcurrency()).toBe(5);
  mocks.save.mockRejectedValueOnce(new Error("disk full"));
  await expect(service.updateDistributionConcurrency(1)).rejects.toThrow();
  expect(service.getDistributionConcurrency()).toBe(5);
  await expect(service.updateDistributionConcurrency(0)).rejects.toThrow();
});

it("reconciles interrupted work on startup without resubmitting it", async () => {
  const service = await import("./distribution-service");
  api.mockImplementation(async (url: string) =>
    url.includes("?page=")
      ? json({
          total: 1,
          items: [
            {
              id: "work",
              targets: [
                { id: "waiting", publishStatus: "queued" },
                { id: "running", publishStatus: "running" },
                { id: "done", publishStatus: "succeeded" },
              ],
            },
          ],
        })
      : json({}),
  );
  await service.recoverInterruptedDistributions();
  expect(
    api.mock.calls.filter(([url]) => url.endsWith("/cancel")),
  ).toHaveLength(2);
  expect(mocks.start).not.toHaveBeenCalled();
});

it("retries result persistence without publishing the target again", async () => {
  vi.useFakeTimers();
  try {
    const service = await import("./distribution-service");
    let attempts = 0;
    const original = api.getMockImplementation()!;
    api.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/retry/complete")) {
        attempts += 1;
        if (attempts === 1) {
          return new Response("", { status: 503 });
        }
      }
      return original(url, init);
    });
    await service.submitDistribution({ contentId: "work", targetId: "retry" });
    await flush();
    results.get("retry")!({ requestId: "retry", targetId: "retry", ok: true });
    await flush();
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(attempts).toBe(2);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("preserves a known successful result when quitting during a persistence retry", async () => {
  const service = await import("./distribution-service");
  let attempts = 0;
  const original = api.getMockImplementation()!;
  api.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith("/retry/complete")) {
      attempts += 1;
      if (attempts === 1) {
        return new Response("", { status: 503 });
      }
    }
    return original(url, init);
  });
  await service.submitDistribution({ contentId: "work", targetId: "retry" });
  await flush();
  results.get("retry")!({
    requestId: "retry",
    targetId: "retry",
    ok: true,
    platformPostId: "known-post",
  });
  await flush();
  await service.stopDistributions();
  expect(attempts).toBe(2);
  expect(api.mock.calls.some(([url]) => url.endsWith("/retry/cancel"))).toBe(
    false,
  );
});

it("cancels a waiting task, refuses a running one and restores the task when saving fails", async () => {
  const service = await import("./distribution-service");
  await service.updateDistributionConcurrency(1);
  await service.submitDistribution({ contentId: "work" });
  await flush();
  expect(await service.cancelDistribution({ contentId: "work", targetId: "1" })).toEqual({
    ok: false,
    message: "已开始发布，无法取消",
  });
  expect(await service.cancelDistribution({ contentId: "work", targetId: "2" })).toEqual({ ok: true });
  expect(api).toHaveBeenCalledWith(
    "http://127.0.0.1:3928/contents/work/targets/2/cancel",
    expect.objectContaining({ method: "POST" }),
  );
  expect(service.getDistributionSnapshot().tasks.map((task) => task.targetId)).not.toContain("2");
  api.mockImplementationOnce(async () => new Response("{}", { status: 503 }));
  expect(await service.cancelDistribution({ contentId: "work", targetId: "3" })).toMatchObject({ ok: false });
  expect(service.getDistributionSnapshot().tasks.map((task) => task.targetId)).toContain("3");
});

it("retries several accounts one by one and reports which could not be queued", async () => {
  const service = await import("./distribution-service");
  let calls = 0;
  api.mockImplementation(async (url: string) => {
    if (url.endsWith("/retry")) {
      calls += 1;
      if (calls === 2) {
        return new Response("{}", { status: 400 });
      }
      return json({ dispatch: dispatch(url.split("/").at(-2)!) });
    }
    if (url.endsWith("/start")) {
      return json({ dispatch: dispatch(url.split("/").at(-2)!) });
    }
    return json({});
  });
  const result = await service.retryDistributions([
    { contentId: "a", targetId: "x" },
    { contentId: "a", targetId: "y" },
    { contentId: "b", targetId: "z" },
  ]);
  expect(result).toEqual({ queued: ["x", "z"], failed: ["y"] });
});

it("blocks publishing before queueing when an account's login is confirmed invalid", async () => {
  api.mockImplementation(async (url: string) => {
    if (url.endsWith("/contents/work")) {
      return json({
        targets: [
          { id: "t1", platformAccountId: "acc-1", publishStatus: "idle" },
          { id: "t2", platformAccountId: "acc-2", publishStatus: "succeeded" },
        ],
      });
    }
    return json({ dispatches: [] });
  });
  mocks.invalid.mockResolvedValue([{ id: "acc-1", displayName: "Alice", platform: "douyin", status: "expired" }]);
  const service = await import("./distribution-service");
  const result = await service.submitDistribution({ contentId: "work" });
  expect(result).toEqual({
    ok: false,
    message: "「Alice」登录已失效，请先在「媒体账号」重新授权后再发布",
  });
  // 只检测还要发布的账号，且没有调用发布接口
  expect(mocks.invalid).toHaveBeenCalledWith(["acc-1"]);
  expect(api.mock.calls.some(([url]) => String(url).endsWith("/publish"))).toBe(false);
  expect(mocks.start).not.toHaveBeenCalled();
});

it("lets publishing through when the login check itself fails", async () => {
  mocks.invalid.mockRejectedValue(new Error("offline"));
  const service = await import("./distribution-service");
  const result = await service.submitDistribution({ contentId: "work" });
  expect(result.ok).toBe(true);
});
