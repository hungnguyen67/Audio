import { useEditorContext } from "./EditorContext";

export function ChapterFields() {
  const { state, dispatch } = useEditorContext();
  const { form } = state;
  const bind = (field) => ({
    value: form[field],
    onChange: (event) => dispatch({ type: "SET_FIELD", field, value: event.target.value }),
  });

  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor="chapter-story-title">
          Tên truyện
        </label>
        <input
          id="chapter-story-title"
          className="form-input"
          placeholder="Nhập hoặc sửa tên truyện..."
          {...bind("story")}
        />
      </div>
      <div className="form-group mb-0 flex min-h-0 flex-1 flex-col">
        <label className="form-label shrink-0" htmlFor="chapter-content">
          Nội dung chương
        </label>
        <textarea
          id="chapter-content"
          className="form-textarea min-h-0 max-h-none flex-1 resize-none"
          placeholder="Dán nội dung chương vào đây..."
          {...bind("content")}
        />
      </div>
    </>
  );
}
