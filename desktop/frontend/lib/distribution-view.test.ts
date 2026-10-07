import { distributionElapsed, distributionTime } from "./distribution-view";
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
it("keeps yesterday and older completion dates distinguishable", () => {
  const now = new Date(2026, 9, 7, 1, 0).getTime();
  expect(
    distributionTime(new Date(2026, 9, 6, 20, 10).toISOString(), now),
  ).toBe("昨天 20:10");
  expect(
    distributionTime(new Date(2025, 9, 6, 20, 10).toISOString(), now),
  ).toContain("2025");
});
