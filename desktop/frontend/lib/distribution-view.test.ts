import {
  distributionElapsed,
  distributionTaskStatus,
  distributionTime,
} from "./distribution-view";
import type {
  DistributionLiveTask,
  DistributionTaskRow,
} from "@shared/distribution";

it("uses the current attempt when the saved row still contains the previous result", () => {
  const now = new Date("2026-10-07T01:00:00Z").getTime();
  const row = {
    startedAt: "2026-10-06T01:00:00Z",
    finishedAt: "2026-10-06T01:02:00Z",
    publishStatus: "failed",
  } as DistributionTaskRow;
  const live = {
    state: "running",
    startedAt: "2026-10-07T00:59:40Z",
  } as DistributionLiveTask;
  expect(distributionElapsed(row, live, now)).toBe("20 秒");
  expect(distributionElapsed(row, undefined, now)).toBe("2 分 0 秒");
  expect(
    distributionElapsed(
      row,
      {
        state: "waiting",
        queuedAt: "2026-10-07T00:59:30Z",
      } as DistributionLiveTask,
      now,
    ),
  ).toBe("30 秒");
});
it("shows upload percent and speed while a live task is uploading", () => {
  const row = {
    publishStatus: "running",
  } as DistributionTaskRow;
  expect(
    distributionTaskStatus(row, {
      state: "running",
      phase: "uploading",
      uploadPercent: 42,
      uploadSpeedBps: 2.5 * 1024 * 1024,
    } as DistributionLiveTask),
  ).toBe("上传到平台 42% · 2.5 MB/s");
  expect(
    distributionTaskStatus(row, {
      state: "running",
      phase: "uploading",
      uploadPercent: 8,
    } as DistributionLiveTask),
  ).toBe("上传到平台 8%");
});

it("keeps yesterday and older completion dates distinguishable", () => {
  const now = new Date(2026, 9, 7, 1, 0).getTime();
  expect(
    distributionTime(new Date(2026, 9, 6, 20, 10).toISOString(), now),
  ).toBe("昨天 20:10");
  expect(
    distributionTime(new Date(2025, 9, 6, 20, 10).toISOString(), now),
  ).toContain("2025");
});

it("classifies issues into actionable kinds and only plain failures are batch-retryable", async () => {
  const { distributionIssue, canRetryDistribution } = await import(
    "./distribution-view"
  );
  const base = { publishStatus: "failed" as const, accountAvailable: true };
  expect(distributionIssue({ ...base, errorCode: "AUTH_EXPIRED" })?.kind).toBe("auth");
  expect(distributionIssue({ ...base, errorCode: "MEDIA_UNREACHABLE" })?.kind).toBe("media");
  expect(distributionIssue({ ...base, errorCode: "PUBLISH_RESULT_UNKNOWN" })?.kind).toBe("unknown");
  expect(distributionIssue({ ...base, errorCode: "HTTP_TIMEOUT" })?.kind).toBe("failed");
  expect(distributionIssue({ ...base, errorCode: null, accountAvailable: false })?.kind).toBe("account");
  expect(distributionIssue({ ...base, publishStatus: "cancelled", errorCode: "cancelled" })?.kind).toBe("cancelled");
  expect(distributionIssue({ ...base, publishStatus: "succeeded", errorCode: null })).toBeNull();
  expect(canRetryDistribution({ ...base, errorCode: "PUBLISH_FAILED" })).toBe(true);
  expect(canRetryDistribution({ ...base, errorCode: "PUBLISH_RESULT_UNKNOWN" })).toBe(false);
  expect(canRetryDistribution({ ...base, errorCode: "AUTH_EXPIRED" })).toBe(false);
});

it("splits work progress into success, attention, running and waiting segments", async () => {
  const { distributionWorkProgress } = await import("./distribution-view");
  const rows = [
    { targetId: "a", publishStatus: "succeeded" },
    { targetId: "b", publishStatus: "failed" },
    { targetId: "c", publishStatus: "failed" },
    { targetId: "d", publishStatus: "queued" },
  ] as DistributionTaskRow[];
  const live = [{ targetId: "c", state: "running" }] as DistributionLiveTask[];
  expect(distributionWorkProgress(rows, live)).toEqual({
    succeeded: 1,
    attention: 1,
    running: 1,
    waiting: 1,
    total: 4,
  });
});

it("treats a work as completed only when every account succeeded and nothing is live", async () => {
  const { isDistributionWorkCompleted } = await import("./distribution-view");
  const rows = [
    { targetId: "a", publishStatus: "succeeded" },
    { targetId: "b", publishStatus: "succeeded" },
  ] as DistributionTaskRow[];
  expect(isDistributionWorkCompleted(rows, [])).toBe(true);
  expect(
    isDistributionWorkCompleted(rows, [{ targetId: "b", state: "waiting" } as DistributionLiveTask]),
  ).toBe(false);
  expect(
    isDistributionWorkCompleted([...rows, { targetId: "c", publishStatus: "failed" } as DistributionTaskRow], []),
  ).toBe(false);
});
