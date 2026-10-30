import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchStories } from "../../entities/stories/storiesSlice";
import { selectStoryById, selectStoriesStatus } from "../../entities/stories/selectors";
import { PlayerCard } from "./PlayerCard";
import { PLAYER_WINDOW_CHANNEL, postPlayerWindowMessage } from "./playerWindow";
import { usePlayer } from "./usePlayer";

export function PlayerWindowPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const storyId = params.get("story");
  const chapterId = params.get("chapter");
  const initialPosition = Number(params.get("position")) || 0;
  const dispatch = useDispatch();
  const status = useSelector(selectStoriesStatus);
  const story = useSelector(selectStoryById(storyId));
  const { play, status: playbackStatus } = usePlayer();
  const [position, setPosition] = useState(initialPosition);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const chapter = story?.chapters.find((item) => item.id === chapterId);

  useEffect(() => {
    if (status === "idle") dispatch(fetchStories());
  }, [dispatch, status]);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return undefined;
    const channel = new BroadcastChannel(PLAYER_WINDOW_CHANNEL);
    const onMessage = (event) => {
      if (
        event.data?.type === "playback-state" &&
        event.data.current?.storyId === storyId &&
        event.data.current?.chapterId === chapterId &&
        !started
      ) {
        setPosition(event.data.positionSeconds);
      }
      if (event.data?.type === "stop-player-window") {
        window.close();
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [chapterId, started, storyId]);

  useEffect(() => {
    const release = () => postPlayerWindowMessage({ type: "player-window-closed" });
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, []);

  const startPlayback = async () => {
    if (!storyId || !chapter || starting) return;
    setStarting(true);
    const didStart = await play(storyId, chapter, { positionSeconds: position });
    if (didStart) {
      setStarted(true);
      postPlayerWindowMessage({ type: "player-window-started" });
    }
    setStarting(false);
  };

  return (
    <main className="player-window-page">
      {chapter ? (
        <>
          <h1>{story?.title}</h1>
          <p className="player-window-chapter">{`Chương ${chapter.number}`}</p>
          {!started && (
            <button type="button" className="btn btn-dark player-window-start" onClick={startPlayback} disabled={starting}>
              {starting ? "Đang chuẩn bị audio..." : "Bắt đầu nghe"}
            </button>
          )}
          {started && <PlayerCard />}
          {!started && playbackStatus !== "Vui lòng chọn một chương để bắt đầu nghe" && (
            <p className="player-window-status">{playbackStatus}</p>
          )}
        </>
      ) : (
        <p className="player-window-status">
          {status === "loading" || status === "idle" ? "Đang tải chương..." : "Không tìm thấy chương cần phát."}
        </p>
      )}
    </main>
  );
}
