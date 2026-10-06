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
