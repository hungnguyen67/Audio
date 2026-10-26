import { audioApi } from "../../api/audio";

const POLL_INTERVAL_MS = 700;

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
  return `Đang phát · tạo audio ${done}/${job.totalChunks} đoạn (${percent}%)`;
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
  return {
    url: result.streamUrl || audioApi.streamUrl(result.jobId),
    jobId: result.jobId,
  };
}

export async function monitorAudioJob(jobId, { signal, onProgress }) {
  while (true) {
    const job = await audioApi.getJob(jobId);
    signal.throwIfAborted();
    if (job.status === "not_found") {
      throw new Error("Không tìm thấy tác vụ tạo audio.");
    }
    if (job.status === "failed") {
      throw new Error(job.message || "Tạo audio thất bại.");
    }
    if (job.status === "completed") return;
    onProgress(describeProgress(job));
    await sleep(POLL_INTERVAL_MS, signal);
  }
}
