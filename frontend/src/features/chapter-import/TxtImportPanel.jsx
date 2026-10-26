import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useEditorContext } from "../chapter-editor/EditorContext";
import { useTxtImport } from "./useTxtImport";

export function TxtImportPanel() {
  const { state, busy } = useEditorContext();
  const importTxt = useTxtImport();
  const fileInput = useRef(null);
  const [perEpisode, setPerEpisode] = useState("1");

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) importTxt({ file, perEpisode });
  };

  return (
    <div className="admin-import-txt-section">
      <input
        ref={fileInput}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={handleFile}
        disabled={busy}
      />
      <div className="admin-import-txt-heading">
        <label className="form-label" htmlFor="txt-chapters-per-episode">
          Số chương gộp thành một tập
        </label>
        <input
          id="txt-chapters-per-episode"
          className="form-input admin-import-txt-count"
          type="number"
          min="1"
          step="1"
          value={perEpisode}
          onChange={(event) => setPerEpisode(event.target.value)}
          disabled={busy}
        />
      </div>
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
          <small>Tải tệp TXT để tách chương và thêm vào danh sách</small>
        </span>
      </button>
    </div>
  );
}
