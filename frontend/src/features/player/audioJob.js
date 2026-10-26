import { audioApi } from "../../api/audio";

const POLL_INTERVAL_MS = 500;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function describeProgress(job) {
  if (!job.totalChunks) return "Đang tạo audio...";
  const done = job.completedCount ?? 0;
  const percent = Math.round((done / job.totalChunks) * 100);
  return `Đang tạo audio: ${done}/${job.totalChunks} (${percent}%)`;
}

/** Tạo (hoặc lấy lại) audio của chương, poll một vòng duy nhất cho đến khi có URL. Huỷ bằng AbortSignal. */
export async function resolveAudioUrl(chapterId, voice, { signal, onStatus }) {
  const result = await audioApi.createJob(chapterId, voice);
  signal.throwIfAborted();
  if (result.status === "ready") return result.url;

  while (true) {
    const job = await audioApi.getJob(result.jobId);
    signal.throwIfAborted();
    if (job.status === "failed") throw new Error(job.message || "Tạo audio thất bại.");
    if (job.status === "completed") {
      if (!job.finalUrl) {
        throw new Error("Audio đã tạo xong nhưng không tìm thấy tệp audio hoàn chỉnh.");
      }
      return job.finalUrl;
    }
    onStatus(describeProgress(job));
    await sleep(POLL_INTERVAL_MS, signal);
  }
}
