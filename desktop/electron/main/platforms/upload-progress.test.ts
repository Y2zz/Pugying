import {
  createUploadMeter,
  throttleVideoUploadProgress,
  videoUploadProgressFields,
} from "./upload-progress";

it("reports 0 then partial then 100 with a speed after enough time", async () => {
  const events: number[] = [];
  const meter = createUploadMeter(100, (progress) => {
    events.push(progress.percent);
  });
  meter.start();
  meter.add(40);
  await new Promise((resolve) => {
    setTimeout(resolve, 90);
  });
  meter.add(60);
  meter.finish();
  expect(events[0]).toBe(0);
  expect(events.at(-1)).toBe(100);
  expect(events).toContain(40);
});

it("throttles the same percent and always emits 100", () => {
  const percents: number[] = [];
  const notify = throttleVideoUploadProgress((progress) => {
    percents.push(progress.percent);
  });
  const sample = {
    uploadedBytes: 10,
    totalBytes: 100,
    percent: 10,
    speedBps: 1,
  };
  notify(sample);
  notify(sample);
  notify({ ...sample, percent: 100, uploadedBytes: 100 });
  expect(percents).toEqual([10, 100]);
});

it("maps upload fields to queue copy", () => {
  expect(
    videoUploadProgressFields({
      uploadedBytes: 1,
      totalBytes: 2,
      percent: 50,
      speedBps: 3,
    }).message,
  ).toBe("上传视频 50%");
  expect(
    videoUploadProgressFields({
      uploadedBytes: 2,
      totalBytes: 2,
      percent: 100,
      speedBps: 0,
    }).message,
  ).toBe("视频已上传，等待处理");
});
