import { app } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  DistributionActionResult,
  DistributionBatchResult,
  DistributionTargetRef,
  DistributionSubmission,
  DistributionSubmissionResult,
  DistributionSnapshot,
  DistributionLiveTask,
} from "../../shared/distribution";
import { isDistributionConcurrency } from "../../shared/distribution";
import { findInvalidAccounts } from "./account-session";
import { DistributionQueue, type DistributionTask } from "./distribution-queue";
import {
  readDistributionConcurrency,
  saveDistributionConcurrency,
} from "./distribution-settings";
import {
  cancelPublishJob,
  setPublishConcurrency,
  startPublishJob,
} from "./publish-job";
import type {
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "./publish-protocol";
import { getApiBaseUrl, getLocalApiToken } from "./server-process";

type Dispatch = Omit<PlatformPublishStartPayload, "requestId">;
class LocalApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super("分发操作未能完成，请检查作品和账号后重试");
  }
}
const activeRequests = new Map<string, string>();
const finishedResults = new Map<string, PlatformPublishResultPayload>();
const submitting = new Set<string>();
const live = new Map<
  string,
  Pick<DistributionLiveTask, "queuedAt" | "startedAt" | "phase" | "state">
>();
const observers = new Set<() => void>();
let revision = 0;
function changed(): void {
  revision += 1;
  for (const observer of observers) {
    try {
      observer();
    } catch {
      // 观测窗口退出或刷新不影响发布任务。
    }
  }
}
export function observeDistributions(observer: () => void): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}
export function getDistributionSnapshot(): DistributionSnapshot {
  const concurrency = getDistributionConcurrency();
  const state = queue.snapshot();
  return {
    revision,
    concurrency,
    tasks: [
      ...state.running.map((task): DistributionLiveTask => ({
        ...task,
        ...live.get(task.targetId)!,
        state:
          live.get(task.targetId)?.state === "saving" ? "saving" : "running",
      })),
      ...state.waiting.map((task): DistributionLiveTask => ({
        ...task,
        ...live.get(task.targetId)!,
        state: "waiting",
      })),
    ],
  };
}
let stopping = false;
let initialized = false;
let saveSettings = Promise.resolve();

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pugying-Local-Token": getLocalApiToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as {
      errorCode?: unknown;
    } | null;
    const errorCode =
      typeof failure?.errorCode === "string" &&
      ["MEDIA_MISSING", "AUTH_EXPIRED"].includes(failure.errorCode)
        ? failure.errorCode
        : undefined;
    throw new LocalApiError(response.status, errorCode);
  }
  return response.json() as Promise<T>;
}

function targetPath(task: DistributionTask): string {
  return `/contents/${task.contentId}/targets/${task.targetId}`;
}

async function reportResult(
  task: DistributionTask,
  result: PlatformPublishResultPayload,
): Promise<void> {
  await request(`${targetPath(task)}/complete`, {
    ok: result.ok,
    errorCode: result.errorCode ?? result.error,
    errorMessage: result.error,
    platformPostId: result.platformPostId,
    platformUrl: result.platformUrl,
  });
  finishedResults.delete(task.targetId);
}

async function execute(task: DistributionTask): Promise<void> {
  live.set(task.targetId, {
    ...live.get(task.targetId)!,
    state: "running",
    startedAt: new Date().toISOString(),
    phase: "accepted",
  });
  changed();
  let result: PlatformPublishResultPayload;
  try {
    if (stopping) {
      return;
    }
    const { dispatch } = await request<{ dispatch: Dispatch }>(
      `${targetPath(task)}/start`,
      {},
    );
    if (stopping) {
      return;
    }
    const requestId = randomUUID();
    activeRequests.set(task.targetId, requestId);
    result = await new Promise<PlatformPublishResultPayload>((resolve) => {
      // 大视频分片上传可能超过 15 分钟；超时仅作兜底取消，不缩短平台侧限制
      const timer = setTimeout(
        () => {
          cancelPublishJob(requestId);
        },
        60 * 60 * 1000,
      );
      const started = startPublishJob({
        payload: { ...dispatch, requestId },
        onProgress: (event) => {
          // 只传阶段与数值进度；平台原始消息、Cookie 与本机路径不进入观测通道。
          const current = live.get(task.targetId)!;
          live.set(task.targetId, {
            ...current,
            phase: event.phase,
            // 后续仍是 uploading 但没有百分比（封面、转码）时清掉，避免停在 100%
            ...(typeof event.percent === "number" &&
            Number.isFinite(event.percent)
              ? {
                  uploadPercent: Math.min(
                    100,
                    Math.max(0, Math.floor(event.percent)),
                  ),
                }
              : { uploadPercent: undefined, uploadSpeedBps: undefined }),
            ...(typeof event.speedBps === "number" &&
            Number.isFinite(event.speedBps) &&
            event.speedBps >= 0
              ? { uploadSpeedBps: event.speedBps }
              : { uploadSpeedBps: undefined }),
          });
          changed();
        },
        onResult: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
      if ("error" in started) {
        clearTimeout(timer);
        resolve({
          requestId,
          targetId: task.targetId,
          ok: false,
          errorCode: started.error,
        });
      }
    });
  } catch (error) {
    result = {
      requestId: "",
      targetId: task.targetId,
      ok: false,
      errorCode:
        error instanceof LocalApiError
          ? (error.errorCode ?? "PUBLISH_FAILED")
          : "PUBLISH_FAILED",
      error: "分发失败，请检查作品和账号后重试",
    };
  } finally {
    activeRequests.delete(task.targetId);
  }
  finishedResults.set(task.targetId, result);
  live.set(task.targetId, { ...live.get(task.targetId)!, state: "saving" });
  changed();
  // 重试的是结果保存，不会重复发布。保存成功前继续占用该账号的队列位置。
  while (!stopping) {
    try {
      await reportResult(task, result);
      live.delete(task.targetId);
      return;
    } catch (error) {
      if (
        error instanceof LocalApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
      ) {
        // 目标已取消/删除等终态无需重试；网络故障和服务暂不可用继续保存结果。
        finishedResults.delete(task.targetId);
        live.delete(task.targetId);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const queue = new DistributionQueue(execute, changed);

function settingsPath(): string {
  return join(app.getPath("userData"), "distribution-settings.json");
}

export function getDistributionConcurrency(): number {
  if (!initialized) {
    initialized = true;
    const value = readDistributionConcurrency(settingsPath());
    queue.setConcurrency(value);
    setPublishConcurrency(value);
  }
  return queue.getConcurrency();
}

export async function updateDistributionConcurrency(
  value: unknown,
): Promise<number> {
  if (!isDistributionConcurrency(value)) {
    throw new Error("请输入大于零的整数");
  }
  getDistributionConcurrency();
  const update = saveSettings
    .catch(() => undefined)
    .then(async () => {
      await saveDistributionConcurrency(settingsPath(), value);
      setPublishConcurrency(value);
      queue.setConcurrency(value);
    });
  saveSettings = update;
  await update;
  return value;
}

export async function submitDistribution(
  input: DistributionSubmission,
): Promise<DistributionSubmissionResult> {
  getDistributionConcurrency();
  if (stopping || submitting.has(input.contentId)) {
    return {
      ok: false,
      message: stopping ? "应用正在退出" : "正在提交，请稍候",
    };
  }
  submitting.add(input.contentId);
  try {
    const base = `/contents/${input.contentId}`;
    const blocked = await invalidAccountMessage(input);
    if (blocked) {
      return { ok: false, message: blocked };
    }
    const dispatches = input.targetId
      ? [
          (
            await request<{ dispatch: Dispatch }>(
              `${base}/targets/${input.targetId}/retry`,
              {},
            )
          ).dispatch,
        ]
      : (await request<{ dispatches: Dispatch[] }>(`${base}/publish`, {}))
          .dispatches;
    const tasks = dispatches.map((dispatch) => ({
      contentId: input.contentId,
      targetId: dispatch.targetId,
      accountId: dispatch.accountId,
    }));
    if (stopping) {
      await Promise.allSettled(
        tasks.map((task) => request(`${targetPath(task)}/cancel`, {})),
      );
      return { ok: false, message: "应用正在退出" };
    }
    for (const task of tasks) {
      live.set(task.targetId, {
        queuedAt: new Date().toISOString(),
        state: "waiting",
      });
    }
    queue.enqueue(tasks);
    return { ok: true, targetIds: tasks.map((task) => task.targetId) };
  } catch {
    return { ok: false, message: "未能加入分发队列，请检查作品和账号后重试" };
  } finally {
    submitting.delete(input.contentId);
  }
}

/**
 * 发布前登录检测：已确认失效的账号直接拦下，提示先重新授权，而不是排队后再失败。
 * 检测本身失败（网络、读取作品失败）时放行，由发布结果兜底。
 */
async function invalidAccountMessage(
  input: DistributionSubmission,
): Promise<string | null> {
  try {
    const detail = await request<{
      targets?: Array<{
        id: string;
        platformAccountId: string;
        publishStatus: string;
      }>;
    }>(`/contents/${input.contentId}`);
    const targets = (detail.targets ?? []).filter((target) =>
      input.targetId
        ? target.id === input.targetId
        : ["idle", "failed", "cancelled"].includes(target.publishStatus),
    );
    const invalid = await findInvalidAccounts([
      ...new Set(targets.map((target) => target.platformAccountId)),
    ]);
    if (invalid.length === 0) {
      return null;
    }
    const names = invalid
      .map((account) => `「${account.displayName ?? "未命名账号"}」`)
      .join("、");
    return `${names}登录已失效，请先在「媒体账号」重新授权后再发布`;
  } catch {
    return null;
  }
}

/** 只取消尚未开始的任务；已开始上传的任务无法安全中断，避免平台上留下半成品。 */
export async function cancelDistribution(
  input: DistributionTargetRef,
): Promise<DistributionActionResult> {
  if (stopping) {
    return { ok: false, message: "应用正在退出" };
  }
  if (queue.isRunning(input.targetId)) {
    return { ok: false, message: "已开始发布，无法取消" };
  }
  const removed = queue.remove(input.targetId);
  try {
    await request(
      `/contents/${input.contentId}/targets/${input.targetId}/cancel`,
      {},
    );
  } catch {
    if (removed) {
      // 落库失败时放回队列，保持界面与实际执行一致。
      queue.enqueue([removed]);
    }
    return { ok: false, message: "未能取消，请稍后重试" };
  }
  live.delete(input.targetId);
  changed();
  return { ok: true };
}

/** 逐个提交重试，单个失败不影响其余账号；同作品其余账号分发中时新任务排队等待。 */
export async function retryDistributions(
  inputs: DistributionTargetRef[],
): Promise<DistributionBatchResult> {
  const result: DistributionBatchResult = { queued: [], failed: [] };
  for (const input of inputs) {
    const submitted = await submitDistribution(input);
    if (submitted.ok) {
      result.queued.push(input.targetId);
    } else {
      result.failed.push(input.targetId);
    }
  }
  return result;
}

/** 应用重启时不自动重复发布；中断任务可由用户核对后重试。 */
export async function recoverInterruptedDistributions(): Promise<void> {
  getDistributionConcurrency();
  let page = 1;
  while (true) {
    const result = await request<{
      total: number;
      items: Array<{
        id: string;
        targets: Array<{ id: string; publishStatus: string }>;
      }>;
    }>(`/contents?page=${page}&pageSize=100`);
    for (const item of result.items) {
      for (const target of item.targets) {
        if (
          target.publishStatus === "queued" ||
          target.publishStatus === "running"
        ) {
          await request(`/contents/${item.id}/targets/${target.id}/cancel`, {});
        }
      }
    }
    if (page * 100 >= result.total || result.items.length === 0) {
      return;
    }
    page += 1;
  }
}

export async function stopDistributions(): Promise<void> {
  stopping = true;
  const tasks = queue.stop();
  for (const requestId of activeRequests.values()) {
    cancelPublishJob(requestId);
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5000);
    void queue.settled().finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
  // 服务尚在运行时落库，避免退出后一直显示发布中。
  await Promise.allSettled(
    tasks.map((task) => {
      const result = finishedResults.get(task.targetId);
      // 已知结果先保存，不能把已完成的发布改成取消；其余任务才记录为中断。
      if (result && result.errorCode !== "cancelled") {
        return reportResult(task, result);
      }
      finishedResults.delete(task.targetId);
      return request(`${targetPath(task)}/cancel`, {});
    }),
  );
}
