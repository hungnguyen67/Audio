export const PLAYER_WINDOW_CHANNEL = "audio-story-player-window";

export function postPlayerWindowMessage(message) {
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(PLAYER_WINDOW_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
}
