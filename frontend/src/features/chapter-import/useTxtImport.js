import {
  EPISODE_TARGET_MINUTES,
  ESTIMATED_CHARACTERS_PER_MINUTE,
  splitTextIntoEpisodes,
} from "../../lib/textChapters";
import { useEditorContext } from "../chapter-editor/EditorContext";

export function useTxtImport() {
  const { state, dispatch } = useEditorContext();

  return async ({ file }) => {
    const fail = (message) => dispatch({ type: "IMPORT_FINISH", message });
    const hasWork = state.form.content.trim() || state.pending.chapters.length;
    if (
      hasWork &&
      !window.confirm("Nhập tệp TXT sẽ thay thế nội dung hoặc danh sách chương đang chờ. Tiếp tục?")
    ) {
      return undefined;
    }

    dispatch({ type: "IMPORT_START" });
    dispatch({ type: "IMPORT_MESSAGE", message: `Đang đọc ${file.name}...` });
    try {
      const text = await file.text();
      const episodes = splitTextIntoEpisodes(text);
      const characterCount = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim().length;
      if (!episodes.length) return fail("Tệp TXT không có nội dung.");

      dispatch({
        type: "IMPORT_FINISH",
        pending: { chapters: episodes, mergedFrom: 0, fromTxt: true },
        patch: {
          story: state.form.story.trim() ? state.form.story : file.name.replace(/\.txt$/i, ""),
          content: "",
        },
        message: `Đã đọc ${characterCount.toLocaleString("vi-VN")} ký tự và chia thành ${episodes.length} tập, khoảng ${EPISODE_TARGET_MINUTES} phút/tập (ước tính ${ESTIMATED_CHARACTERS_PER_MINUTE} ký tự/phút). Kiểm tra rồi bấm Lưu.`,
      });
    } catch (error) {
      fail(`Không thể đọc tệp TXT: ${error.message}`);
    }
    return undefined;
  };
}
