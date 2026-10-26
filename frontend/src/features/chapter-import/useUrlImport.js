import { chaptersApi } from "../../api/chapters";
import { useEditorContext } from "../chapter-editor/EditorContext";
import { buildUrlImportResult } from "./importResult";
import { parseChapterRange, parseSourceUrl } from "./sources";

export function useUrlImport() {
  const { state, dispatch } = useEditorContext();

  return async ({ url, from, to }) => {
    const fail = (message) => dispatch({ type: "IMPORT_FINISH", message });

    const parsed = parseSourceUrl(url);
    if (!parsed.ok) return fail(parsed.error);
    const range = parseChapterRange(from, to);
    if (!range.ok) return fail(range.error);

    const hasWork = state.form.content.trim() || state.pending.chapters.length;
    if (
      hasWork &&
      !window.confirm("Lấy chương mới sẽ thay thế nội dung hoặc danh sách chương đang chờ. Tiếp tục?")
    ) {
      return undefined;
    }

    dispatch({ type: "IMPORT_START" });
    const fetched = [];
    let failure = null;
    try {
      for (let n = range.from; n <= range.to; n += 1) {
        dispatch({ type: "IMPORT_MESSAGE", message: `Đang lấy chương ${n}/${range.to}...` });
        fetched.push(await chaptersApi.importFromUrl(parsed.urlForChapter(n)));
      }
    } catch (error) {
      failure = error;
    }

    dispatch({
      type: "IMPORT_FINISH",
      ...buildUrlImportResult({
        fetched,
        from: range.from,
        to: range.to,
        failure,
        source: parsed.source,
        form: state.form,
        storyId: state.storyId,
      }),
    });
    return undefined;
  };
}
