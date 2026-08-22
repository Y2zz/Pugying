import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from './publish-protocol';

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;
type ResultFn = (result: PlatformPublishResultPayload) => void;

interface ActivePublish {
  requestId: string;
  targetId: string;
  platform: string;
  cancelled: boolean;
  settled: boolean;
  signal: { cancelled: boolean };
  onResult: ResultFn;
}

/** At most one publish job on this Agent (P0). */
let active: ActivePublish | null = null;

export function isPublishBusy(): boolean {
  return active !== null;
}

/**
 * Validates payload, enforces single-flight, then runs Douyin adapter (or stub).
 * Set PUGYING_PUBLISH_STUB=1 to force the progress stub (unit tests / CI).
 */
export function startPublishJob(options: {
  payload: PlatformPublishStartPayload;
  onProgress: ProgressFn;
  onResult: ResultFn;
}): { ok: true } | { error: string } {
  if (active) {
    return { error: 'busy' };
  }

  const { payload } = options;
  if (
    !payload.requestId?.trim() ||
    !payload.targetId?.trim() ||
    !payload.platform?.trim() ||
    !payload.accountId?.trim() ||
    !payload.mediaUrl?.trim() ||
    !payload.coverUrl?.trim() ||
    !payload.coverLandscapeUrl?.trim() ||
    !payload.title?.trim() ||
    !Array.isArray(payload.cookies) ||
    payload.cookies.length === 0
  ) {
    return { error: 'invalid_payload' };
  }

  if (payload.platform !== 'douyin') {
    return { error: 'unsupported_platform' };
  }

  const signal = { cancelled: false };
  const job: ActivePublish = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
    cancelled: false,
    settled: false,
    signal,
    onResult: options.onResult,
  };
  active = job;

  const finish = (result: PlatformPublishResultPayload) => {
    if (job.settled) {
      return;
    }
    job.settled = true;
    if (active?.requestId === job.requestId) {
      active = null;
    }
    options.onResult(result);
  };

  const useStub = process.env.PUGYING_PUBLISH_STUB === '1';
  if (useStub) {
    runStubPublish({
      payload,
      job,
      onProgress: options.onProgress,
      finish,
    });
    return { ok: true };
  }

  void import('./platforms/publish-douyin-strategy')
    .then(({ runDouyinPublishByMode }) => {
      return runDouyinPublishByMode({
        payload,
        onProgress: options.onProgress,
        signal,
      });
    })
    .then((result) => {
      if (job.cancelled || signal.cancelled) {
        finish({
          requestId: payload.requestId,
          targetId: payload.targetId,
          ok: false,
          error: 'cancelled',
          errorCode: 'cancelled',
          platform: payload.platform,
        });
        return;
      }
      finish(result);
    })
    .catch((err: unknown) => {
      finish({
        requestId: payload.requestId,
        targetId: payload.targetId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: 'PUBLISH_FAILED',
        platform: payload.platform,
      });
    });

  return { ok: true };
}

export function cancelPublishJob(requestId: string): boolean {
  if (!active || active.requestId !== requestId) {
    return false;
  }
  const job = active;
  job.cancelled = true;
  job.signal.cancelled = true;
  job.settled = true;
  active = null;
  job.onResult({
    requestId: job.requestId,
    targetId: job.targetId,
    ok: false,
    error: 'cancelled',
    errorCode: 'cancelled',
    platform: job.platform,
  });
  return true;
}

function runStubPublish(options: {
  payload: PlatformPublishStartPayload;
  job: ActivePublish;
  onProgress: ProgressFn;
  finish: (result: PlatformPublishResultPayload) => void;
}): void {
  const { payload, job, onProgress, finish } = options;
  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message?: string,
  ) => {
    if (job.cancelled) {
      return;
    }
    onProgress({
      requestId: payload.requestId,
      targetId: payload.targetId,
      platform: payload.platform,
      phase,
      message,
    });
  };

  emit('accepted');
  const steps: Array<{
    phase: PlatformPublishProgressPayload['phase'];
    delayMs: number;
    message: string;
  }> = [
    { phase: 'fetching_media', delayMs: 50, message: 'stub fetch' },
    { phase: 'opening_creator', delayMs: 50, message: 'stub open' },
    { phase: 'uploading', delayMs: 50, message: 'stub upload' },
    { phase: 'submitting', delayMs: 50, message: 'stub submit' },
  ];

  let i = 0;
  const runNext = () => {
    if (job.cancelled || job.settled) {
      return;
    }
    if (i >= steps.length) {
      emit('done');
      finish({
        requestId: payload.requestId,
        targetId: payload.targetId,
        ok: true,
        platform: payload.platform,
        platformPostId: `stub-${payload.targetId.slice(0, 8)}`,
        platformUrl: 'https://www.douyin.com/stub',
      });
      return;
    }
    const step = steps[i];
    i += 1;
    emit(step.phase, step.message);
    setTimeout(runNext, step.delayMs);
  };
  setTimeout(runNext, 20);
}
