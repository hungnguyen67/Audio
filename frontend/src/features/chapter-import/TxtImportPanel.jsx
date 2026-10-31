import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { EPISODE_TARGET_MINUTES } from "../../lib/textChapters";
import { useEditorContext } from "../chapter-editor/EditorContext";
import { useTxtImport } from "./useTxtImport";

export function TxtImportPanel() {
  const { state, busy } = useEditorContext();
  const importTxt = useTxtImport();
  const fileInput = useRef(null);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) importTxt({ file });
  };

  return (
    <div className="admin-import-txt-section">
      <div className="form-label">Lấy chương từ TXT</div>
      <input
        ref={fileInput}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={handleFile}
        disabled={busy}
      />
      <button
        type="button"
        className="admin-import-txt-button"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        aria-busy={state.importing}
      >
        <span className="admin-import-txt-icon">
          <Upload size={18} />
        </span>
        <span className="admin-import-txt-copy">
          <strong>{state.importing ? "Đang đọc tệp TXT..." : "Chọn tệp TXT"}</strong>
          <small>
            Đọc toàn bộ TXT, chia khoảng {EPISODE_TARGET_MINUTES} phút/tập và tự đặt tên Tập 1, Tập 2...
          </small>
        </span>
      </button>
    </div>
  );
}
