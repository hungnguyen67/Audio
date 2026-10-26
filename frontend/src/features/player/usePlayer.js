import { useContext } from "react";
import { PlayerContext } from "./PlayerProvider";

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer phải được dùng bên trong <PlayerProvider>.");
  return context;
}
