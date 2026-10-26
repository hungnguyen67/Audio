import { useState } from "react";
import { STORAGE_KEYS, usePersistentState } from "../../lib/storage";
import { useEditorContext } from "../chapter-editor/EditorContext";
import { useUrlImport } from "./useUrlImport";

export function UrlImportPanel() {
  const { state, busy } = useEditorContext();
  const importFromUrl = useUrlImport();
  const [url, setUrl] = usePersistentState(STORAGE_KEYS.importUrl, "");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");

  return (
    <div className="admin-import-controls">
      <div className="admin-import-url">
        <label className="form-label" htmlFor="chapter-source-url">
          Lấy chương từ link
        </label>
        <input
          id="chapter-source-url"
          className="form-input"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Dán link chương tại đây"
          disabled={busy}
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="chapter-range-start">
          Từ chương
        </label>
        <input
          id="chapter-range-start"
          className="form-input"
          type="number"
          min="1"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          disabled={busy}
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="chapter-range-end">
          Đến chương
        </label>
        <input
          id="chapter-range-end"
          className="form-input"
          type="number"
          min={from}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          disabled={busy}
        />
      </div>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => importFromUrl({ url, from, to })}
        disabled={busy}
      >
        {state.importing ? "Đang lấy..." : "Lấy chương"}
      </button>
    </div>
  );
}
