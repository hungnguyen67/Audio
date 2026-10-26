import { groupChapters, splitTextIntoChapters } from "../../lib/textChapters";
import { useEditorContext } from "../chapter-editor/EditorContext";

export function useTxtImport() {
  const { state, dispatch } = useEditorContext();

  return async ({ file, perEpisode }) => {
    const fail = (message) => dispatch({ type: "IMPORT_FINISH", message });
    const perEpisodeCount = Number(perEpisode);
    if (!Number.isSafeInteger(perEpisodeCount) || perEpisodeCount < 1) {
      return fail("Số chương gộp mỗi tập phải là số nguyên lớn hơn 0.");
    }
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
      const chapters = splitTextIntoChapters(await file.text());
      if (!chapters.length) {
        return fail(
          'Không tìm thấy tiêu đề chương. Hãy dùng các dòng như "Chương 1: Tên chương" hoặc "Thứ 0001 chương Tên chương" trong tệp TXT.',
        );
      }
      const episodes = groupChapters(chapters, perEpisodeCount);
      dispatch({
        type: "IMPORT_FINISH",
        pending: { chapters: episodes, mergedFrom: perEpisodeCount > 1 ? chapters.length : 0 },
        patch: {
          story: state.form.story.trim() ? state.form.story : file.name.replace(/\.txt$/i, ""),
          number: String(episodes[0].chapterNumber),
          title: episodes[0].title,
          content: "",
        },
        message:
          perEpisodeCount === 1
            ? `Đã tách ${chapters.length} chương từ tệp TXT. Kiểm tra danh sách rồi bấm Lưu.`
            : `Đã tách ${chapters.length} chương nguồn thành ${episodes.length} tập, gộp tối đa ${perEpisodeCount} chương/tập. Kiểm tra danh sách rồi bấm Lưu.`,
      });
    } catch (error) {
      fail(`Không thể đọc tệp TXT: ${error.message}`);
    }
    return undefined;
  };
}
