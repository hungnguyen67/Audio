import { audioApi } from "../../api/audio";

const POLL_INTERVAL_MS = 500;
const INITIAL_BUFFER_CHUNKS = 3;
const MAX_BUFFER_AHEAD_SECONDS = 300;
const RETAINED_BUFFER_SECONDS = 120;

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
    ? ` · đang tạo ${activeChunks
        .map((chunk) => {
          const number = chunk.index + 1;
          const retry = chunk.attempt > 1 ? ` (thử lại ${chunk.attempt}/3)` : "";
          const received = chunk.receivedBytes
            ? ` · nhận ${Math.round(chunk.receivedBytes / 1024)} KB`
            : "";
          return `đoạn ${number}${retry}${received}`;
        })
        .join(", ")}`
    : "";
  return `đã xong ${done}/${job.totalChunks} đoạn (${percent}%)${activeStatus}`;
}

function waitForEvent(target, eventName, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Không thể xử lý audio (${eventName}).`));
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function updateSourceBuffer(sourceBuffer, signal, updateBuffer) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
      sourceBuffer.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onUpdateEnd = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Không thể cập nhật bộ đệm audio."));
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    sourceBuffer.addEventListener("updateend", onUpdateEnd, { once: true });
    sourceBuffer.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      updateBuffer();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function findAudioChunk(job, index) {
  return job.completedChunks?.find((chunk) => chunk.index === index);
}

async function removePlayedBuffer(sourceBuffer, audio, signal) {
  const ranges = sourceBuffer.buffered;
  if (!ranges.length) return false;

  const start = ranges.start(0);
  const removeEnd = Math.min(
    audio.currentTime - RETAINED_BUFFER_SECONDS,
    ranges.end(0) - 0.25,
  );
  if (removeEnd <= start) return false;

  await updateSourceBuffer(sourceBuffer, signal, () => sourceBuffer.remove(start, removeEnd));
  audio.dispatchEvent(new Event("progress"));
  return true;
}

async function waitForBufferCapacity(sourceBuffer, audio, signal) {
  while (true) {
    signal.throwIfAborted();
    const ranges = sourceBuffer.buffered;
    const bufferedEnd = ranges.length ? ranges.end(ranges.length - 1) : audio.currentTime;
    if (bufferedEnd - audio.currentTime <= MAX_BUFFER_AHEAD_SECONDS) return;

    await sleep(POLL_INTERVAL_MS, signal);
  }
}

async function appendChunk(sourceBuffer, bytes, signal, audio) {
  await waitForBufferCapacity(sourceBuffer, audio, signal);
  try {
    await updateSourceBuffer(sourceBuffer, signal, () => sourceBuffer.appendBuffer(bytes));
  } catch (error) {
    if (error.name !== "QuotaExceededError") throw error;
    if (!(await removePlayedBuffer(sourceBuffer, audio, signal))) throw error;
    await updateSourceBuffer(sourceBuffer, signal, () => sourceBuffer.appendBuffer(bytes));
  }
  audio.dispatchEvent(new Event("progress"));
}

async function feedProgressiveAudio(audio, mediaSource, sourceBuffer, jobId, signal, onProgress, onReady, onError) {
  let nextChunkIndex = 0;
  let hasStarted = false;

  try {
    while (true) {
      signal.throwIfAborted();
      const job = await audioApi.getJob(jobId);
      signal.throwIfAborted();
      onProgress(describeProgress(job));

      if (job.status === "not_found") {
        throw new Error("Không tìm thấy tác vụ tạo audio.");
      }

      while (true) {
        const chunk = findAudioChunk(job, nextChunkIndex);
        if (!chunk) break;
        const response = await fetch(chunk.url, { signal });
        if (!response.ok) throw new Error(`Không tải được đoạn audio ${nextChunkIndex + 1}.`);
        const bytes = await response.arrayBuffer();
        signal.throwIfAborted();
        await appendChunk(sourceBuffer, bytes, signal, audio);
        nextChunkIndex += 1;

        if (!hasStarted && nextChunkIndex >= Math.min(INITIAL_BUFFER_CHUNKS, job.totalChunks)) {
          hasStarted = true;
          onReady();
        }
      }

      if (job.status === "failed") {
        throw new Error(job.message || "Tạo audio thất bại.");
      }
      if (job.status === "completed") {
        if (!hasStarted && nextChunkIndex > 0) {
          hasStarted = true;
          onReady();
        }
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
        return;
      }
      await sleep(POLL_INTERVAL_MS, signal);
    }
  } catch (error) {
    if (signal.aborted) throw error;
    if (mediaSource.readyState === "open") {
      try {
        mediaSource.endOfStream();
      } catch {}
    }
    if (hasStarted) {
      onError(error);
      return;
    }
    throw error;
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

export async function startProgressiveAudio(
  audio,
  jobId,
  { signal, startAt = 0, onProgress, onError },
) {
  if (!MediaSource.isTypeSupported("audio/mpeg")) {
    throw new Error("Trình duyệt này không hỗ trợ phát audio trong lúc tạo.");
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  audio.src = objectUrl;
  try {
    await waitForEvent(mediaSource, "sourceopen", signal);
    const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
    sourceBuffer.mode = "sequence";

    let rejectReady;
    let resolveReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    let readySettled = false;
    const feedPromise = feedProgressiveAudio(
      audio,
      mediaSource,
      sourceBuffer,
      jobId,
      signal,
      onProgress,
      () => {
        if (readySettled) return;
        readySettled = true;
        resolveReady();
      },
      onError,
    )
      .then(() => {
        if (!readySettled) {
          readySettled = true;
          rejectReady(new Error("Audio chưa sẵn sàng để phát."));
        }
      })
      .catch((error) => {
        if (!readySettled) {
          readySettled = true;
          rejectReady(error);
        }
      });

    await ready;
    signal.throwIfAborted();
    if (startAt > 0 && audio.seekable.length && startAt <= audio.seekable.end(audio.seekable.length - 1)) {
      audio.currentTime = startAt;
    }
    await audio.play();
    const revokeUrl = () => URL.revokeObjectURL(objectUrl);
    audio.addEventListener("ended", revokeUrl, { once: true });
    signal.addEventListener("abort", revokeUrl, { once: true });
    return { feedPromise };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
