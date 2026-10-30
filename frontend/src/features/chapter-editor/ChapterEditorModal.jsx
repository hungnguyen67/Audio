import { ModalHeader } from "../../components/ModalChrome";
import { TxtImportPanel } from "../chapter-import/TxtImportPanel";
import { UrlImportPanel } from "../chapter-import/UrlImportPanel";
import { ChapterFields } from "./ChapterFields";
import { EditorContext } from "./EditorContext";
import { EditorFooter } from "./EditorFooter";
import { ExistingChapters } from "./ExistingChapters";
import { useSaveChapters } from "./useSaveChapters";

/** `editor` là giá trị trả về của useChapterEditor(); các panel con tự đọc từ context. */
export function ChapterEditorModal({ editor }) {
  const { state, story, actions, busy } = editor;
  const submit = useSaveChapters(editor);
  if (!state.open) return null;

  const title = state.editing ? "Sửa chương" : state.storyId ? "Thêm chương" : "Tạo truyện mới";
  const single = story ? "" : " form-panel-single";
  const editing = state.editing ? " form-panel-editing" : "";

  return (
    <EditorContext.Provider value={editor}>
      <div
        className="form-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) actions.close();
        }}
      >
        <div
          className={`form-panel${single}${editing} h-[640px] max-[860px]:h-auto`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="chapter-editor-title"
        >
          <ModalHeader
            title={title}
            titleId="chapter-editor-title"
            onClose={actions.close}
            closeDisabled={busy}
          />
          <div
            className={`form-modal-grid${story ? "" : " form-modal-grid-single"} flex-1 items-stretch overflow-y-hidden max-[860px]:overflow-y-auto`}
          >
            <div className="form-modal-fields flex h-full min-h-0 flex-col">
              {!state.editing && (
                <div className="form-group">
                  <UrlImportPanel />
                  <TxtImportPanel />
                </div>
              )}
              <ChapterFields />
            </div>
            <ExistingChapters />
          </div>
          <EditorFooter onSubmit={submit} />
        </div>
      </div>
    </EditorContext.Provider>
  );
}
