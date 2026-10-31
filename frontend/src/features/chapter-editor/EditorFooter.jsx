import { useEditorContext } from "./EditorContext";
import { ModalFooter } from "../../components/ModalChrome";

export function getSaveLabel({ saving, pending }) {
  const count = pending.chapters.length;
  if (saving) return "Đang lưu...";
  if (pending.fromTxt) return `Lưu ${count} tập`;
  if (pending.mergedFrom) return count === 1 ? "Lưu 1 tập đã gộp" : `Lưu ${count} tập đã gộp`;
  return count ? `Lưu ${count} chương` : "Lưu";
}

export function EditorFooter({ onSubmit }) {
  const { state, story, actions, busy } = useEditorContext();
  const { editing, saving, pending, importStatus, status } = state;

  return (
    <ModalFooter
      secondaryLabel={editing ? "Hủy" : "Đóng"}
      onSecondary={editing ? () => actions.cancelEdit(story) : actions.close}
      secondaryDisabled={busy}
      primaryLabel={getSaveLabel({ saving, pending })}
      onPrimary={onSubmit}
      primaryDisabled={busy}
      buttonsAlign="left"
      primaryFirst
      status={importStatus}
      liveStatus={status}
    />
  );
}
