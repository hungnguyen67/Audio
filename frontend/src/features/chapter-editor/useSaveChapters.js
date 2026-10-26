import { useDispatch } from "react-redux";
import { toast } from "../../components/Toast";
import {
  createStory,
  fetchStories,
  saveChapter,
  updateChapter,
  updateStory,
} from "../../entities/stories/storiesSlice";

const isDuplicateChapterNumber = (error) =>
  /duplicate entry .* for key ['`]?chapters\.unique_story_chapter/i.test(error?.message || "");

export function useSaveChapters(editor) {
  const dispatch = useDispatch();
  const { state, story, dispatch: editorDispatch } = editor;
  const { form, storyId, editing, pending } = state;

  /** Tạo truyện mới hoặc đổi tên truyện nếu cần; trả về id truyện. */
  const ensureStory = async (title) => {
    if (!storyId) {
      const created = await dispatch(createStory(title)).unwrap();
      editorDispatch({ type: "SET_STORY_ID", storyId: created.id });
      return created.id;
    }
    if (story && title !== story.title) {
      await dispatch(updateStory({ id: storyId, title })).unwrap();
    }
    return storyId;
  };

  const saveImported = async () => {
    const title = form.story.trim();
    if (!title) {
      return toast.error("Thiếu tên truyện", "Vui lòng điền tên truyện trước khi lưu chương.");
    }

    // Một tập gộp: số/tiêu đề/nội dung lấy từ form để người dùng còn chỉnh sửa được.
    const isMergedEpisode = pending.mergedFrom > 0 && pending.chapters.length === 1;
    const items = pending.chapters.map((chapter) =>
      isMergedEpisode
        ? { number: Number(form.number), title: form.title.trim(), content: form.content.trim() }
        : {
            number: chapter.chapterNumber,
            title: chapter.title || `Chương ${chapter.chapterNumber}`,
            content: chapter.content,
          },
    );
    const invalid = items.some(
      (item) =>
        !Number.isInteger(item.number) || item.number < 1 || !item.title.trim() || !item.content.trim(),
    );
    if (invalid) {
      return isMergedEpisode
        ? toast.error(
            "Thông tin tập chưa hợp lệ",
            "Hãy kiểm tra số chương, tiêu đề và nội dung của tập đã gộp trước khi lưu.",
          )
        : toast.error(
            "Dữ liệu chương chưa hợp lệ",
            "Một hoặc nhiều chương đang chờ thiếu số tập, tiêu đề hoặc nội dung.",
          );
    }

    const label = pending.mergedFrom ? "tập" : "chương";
    const existing = new Set((story?.chapters || []).map((chapter) => chapter.number));
    let saved = 0;
    let skipped = 0;
    let remaining = items.length;

    editorDispatch({ type: "SAVE_START" });
    editorDispatch({ type: "SET_STATUS", status: "Đang chuẩn bị lưu chương..." });
    try {
      const id = await ensureStory(title);
      for (const item of items) {
        const position = saved + skipped + 1;
        if (existing.has(item.number)) {
          skipped += 1;
          editorDispatch({
            type: "SET_STATUS",
            status: `Bỏ qua ${label} ${item.number} vì đã tồn tại (${position}/${items.length})...`,
          });
        } else {
          editorDispatch({
            type: "SET_STATUS",
            status: `Đang lưu ${label} ${item.number} (${position}/${items.length})...`,
          });
          try {
            await dispatch(
              saveChapter({
                storyId: id,
                chapterNumber: item.number,
                title: item.title,
                content: item.content,
              }),
            ).unwrap();
            saved += 1;
          } catch (error) {
            if (!isDuplicateChapterNumber(error)) throw error;
            skipped += 1;
          }
          existing.add(item.number);
        }
        remaining -= 1;
        editorDispatch({
          type: "SET_PENDING",
          pending: { ...pending, chapters: pending.chapters.slice(items.length - remaining) },
        });
      }

      await dispatch(fetchStories());
      const skippedMessage = skipped ? ` Bỏ qua ${skipped} chương trùng số.` : "";
      const mergedNote = pending.mergedFrom ? ` (gộp từ ${pending.mergedFrom} chương nguồn)` : "";
      editorDispatch({
        type: "SAVE_SUCCESS",
        status: `Đã lưu ${saved} ${label} thành công.${skippedMessage}${mergedNote}`,
      });
      return toast.success(
        skipped ? "Đã lưu, bỏ qua chương trùng" : "Đã lưu thành công",
        pending.mergedFrom
          ? `${saved} tập gộp từ ${pending.mergedFrom} chương nguồn đã được thêm vào truyện.${skippedMessage}`
          : `${saved} chương đã được thêm vào truyện.${skippedMessage}`,
      );
    } catch (error) {
      editorDispatch({
        type: "SAVE_END",
        status: `Đã lưu ${saved}, bỏ qua ${skipped}; còn ${remaining} mục chưa xử lý. ${error.message}`,
      });
      return toast.error("Không thể lưu hết chương", error.message);
    }
  };

  const saveSingle = async () => {
    const title = form.story.trim();
    if (!title) return toast.error("Thiếu tên truyện", "Vui lòng điền tên truyện.");

    const renameOnly = !form.content.trim();
    if (renameOnly && !(storyId && story && title !== story.title && !editing)) {
      return toast.error("Thiếu nội dung chương", "Vui lòng điền nội dung chương.");
    }

    editorDispatch({ type: "SAVE_START" });
    editorDispatch({
      type: "SET_STATUS",
      status: renameOnly ? "Đang lưu tên truyện..." : "Đang lưu...",
    });
    try {
      const id = await ensureStory(title);
      if (renameOnly) {
        editorDispatch({ type: "SAVE_END", status: "Đã cập nhật tên truyện." });
        return toast.success("Đã cập nhật tên truyện", title);
      }

      if (editing) {
        await dispatch(
          updateChapter({
            id: editing.id,
            chapterNumber: Number(form.number),
            title: form.title.trim(),
            content: form.content.trim(),
          }),
        ).unwrap();
      } else {
        const nextNumber = (story?.chapters || []).reduce((max, c) => Math.max(max, c.number), 0) + 1;
        await dispatch(
          saveChapter({
            storyId: id,
            chapterNumber: Number(form.number) || nextNumber,
            title: form.title.trim() || "Chương mới",
            content: form.content.trim(),
          }),
        ).unwrap();
      }
      await dispatch(fetchStories());
      editorDispatch({ type: "SAVE_SUCCESS", status: "Đã lưu thành công." });
      return toast.success(
        "Đã lưu thành công",
        editing ? "Nội dung chương đã được cập nhật." : "Chương mới đã được thêm vào truyện.",
      );
    } catch (error) {
      editorDispatch({ type: "SAVE_END", status: error.message });
      return toast.error(renameOnly ? "Không thể cập nhật tên truyện" : "Không thể lưu", error.message);
    }
  };

  return () => (pending.chapters.length ? saveImported() : saveSingle());
}
