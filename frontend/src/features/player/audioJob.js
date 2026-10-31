import { audioApi } from "../../api/audio";

const POLL_INITIAL_INTERVAL_MS = 500;
const POLL_MAX_INTERVAL_MS = 2000;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function describeProgress(job) {
  if (!job.totalChunks) return "Đang tạo audio...";
  const done = job.completedCount ?? 0;
  const percent = Math.round((done / job.totalChunks) * 100);
  const activeChunks = job.activeChunks ?? [];
  const activeStatus = activeChunks.length
    ? ` · ${activeChunks
        .map((chunk) => {
          const number = chunk.index + 1;
          const retry = chunk.attempt > 1 ? ` (lần thử ${chunk.attempt})` : "";
          if (chunk.state === "retrying") {
            const reason = chunk.error ? `: ${chunk.error}` : "";
            return `đoạn ${number} · thử lại sau ${chunk.retryInSeconds ?? 0}s${reason}`;
          }
          if (chunk.state === "queued") {
            return `đoạn ${number}${retry} · đang chờ lượt`;
          }
          const received = chunk.receivedBytes
            ? ` · nhận ${Math.round(chunk.receivedBytes / 1024)} KB`
            : "";
          return `đang tạo đoạn ${number}${retry}${received}`;
        })
        .join(", ")}`
    : "";
  return `đã xong ${done}/${job.totalChunks} đoạn (${percent}%)${activeStatus}`;
}

export async function waitForAudioUrl(
  jobId,
  { signal, onProgress, onJobNotFound },
) {
  let activeJobId = jobId;
  let pollIntervalMs = POLL_INITIAL_INTERVAL_MS;

  while (true) {
    signal.throwIfAborted();
    let job = await audioApi.getJob(activeJobId);
    signal.throwIfAborted();

    if (job.status === "not_found") {
      const replacement = await onJobNotFound?.();
      signal.throwIfAborted();
      if (replacement?.status === "ready") return replacement.url;
      if (replacement?.jobId) {
        activeJobId = replacement.jobId;
        continue;
      }
      throw new Error("Không tìm thấy tác vụ tạo audio.");
    }

    onProgress(describeProgress(job));
    if (job.status === "failed") {
      throw new Error(job.message || "Tạo audio thất bại.");
    }
    if (job.status === "completed") {
      if (!job.finalUrl) {
        throw new Error("Tác vụ đã hoàn tất nhưng không có đường dẫn audio.");
      }
      return job.finalUrl;
    }
    pollIntervalMs = Math.min(POLL_MAX_INTERVAL_MS, Math.ceil(pollIntervalMs * 1.5));
    await sleep(pollIntervalMs, signal);
  }
}

export async function resolveAudioUrl(chapterId, voice, { signal }) {
  const result = await audioApi.createJob(chapterId, voice);
  signal.throwIfAborted();
  if (result.status === "ready") {
    return { url: result.url, jobId: null };
  }
  if (!result.jobId) {
    throw new Error("Không nhận được tác vụ tạo audio từ máy chủ.");
  }
  return { url: null, jobId: result.jobId };
}
