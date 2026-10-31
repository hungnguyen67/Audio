import { useDispatch } from "react-redux";
import { toast } from "../../components/Toast";
import { chaptersApi } from "../../api/chapters";
import {
  createStory,
  fetchStories,
  saveChapter,
  updateChapter,
  updateStory,
} from "../../entities/stories/storiesSlice";
import { EPISODE_TARGET_MINUTES } from "../../lib/textChapters";

const isDuplicateChapterNumber = (error) =>
  /duplicate entry .* for key ['`]?chapters\.unique_story_chapter/i.test(error?.message || "");
const isUnsupportedBulkEndpoint = (error) => /HTTP 404\b/.test(error?.message || "");

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

    const isMergedEpisode = pending.mergedFrom > 0 && pending.chapters.length === 1;
    const items = pending.chapters.map((chapter) => ({
      number: chapter.chapterNumber,
      title: pending.fromTxt
        ? `Tập ${chapter.chapterNumber}`
        : isMergedEpisode
          ? chapter.title || `Chương ${chapter.chapterNumber}`
          : `Chương ${chapter.chapterNumber}`,
      content: pending.chapters.length === 1 && form.content.trim()
        ? form.content.trim()
        : chapter.content,
    }));
    const invalid = items.some(
      (item) =>
        !Number.isInteger(item.number) || item.number < 1 || !item.title.trim() || !item.content.trim(),
    );
    if (invalid) {
      return isMergedEpisode
        ? toast.error(
            "Thông tin tập chưa hợp lệ",
            "Tập đã gộp thiếu số chương hoặc nội dung để lưu.",
          )
        : toast.error(
            "Dữ liệu chương chưa hợp lệ",
            "Một hoặc nhiều chương đang chờ thiếu số tập, tiêu đề hoặc nội dung.",
          );
    }

    const label = pending.fromTxt || pending.mergedFrom ? "tập" : "chương";
    const existing = new Set((story?.chapters || []).map((chapter) => chapter.number));
    const itemsToSave = items.filter((item) => !existing.has(item.number));
    let saved = 0;
    let skipped = items.length - itemsToSave.length;
    let remaining = items.length - skipped;
    const completedNumbers = new Set(existing);
    let bulkSupported = true;

    editorDispatch({ type: "SAVE_START" });
    editorDispatch({ type: "SET_STATUS", status: `Đang chuẩn bị lưu ${label}...` });
    try {
      const id = await ensureStory(title);
      const batchSize = 100;
      for (let offset = 0; offset < itemsToSave.length; offset += batchSize) {
        const batch = itemsToSave.slice(offset, offset + batchSize);
        editorDispatch({
          type: "SET_STATUS",
          status: `Đang lưu ${label} ${Math.min(offset + batch.length + skipped, items.length)}/${items.length}...`,
        });
        if (bulkSupported) {
          try {
            await chaptersApi.createMany(id, batch.map((item) => ({
              chapterNumber: item.number,
              title: item.title,
              content: item.content,
            })));
            saved += batch.length;
            remaining -= batch.length;
            batch.forEach((item) => completedNumbers.add(item.number));
          } catch (error) {
            if (!isUnsupportedBulkEndpoint(error)) throw error;
            bulkSupported = false;
          }
        }

        if (!bulkSupported) {
          for (const item of batch) {
            try {
              await dispatch(saveChapter({
                storyId: id,
                chapterNumber: item.number,
                title: item.title,
                content: item.content,
              })).unwrap();
              saved += 1;
            } catch (error) {
              if (!isDuplicateChapterNumber(error)) throw error;
              skipped += 1;
            }
            remaining -= 1;
            completedNumbers.add(item.number);
            editorDispatch({
              type: "SET_PENDING",
              pending: {
                ...pending,
                chapters: pending.chapters.filter(
                  (chapter) => !completedNumbers.has(chapter.chapterNumber),
                ),
              },
            });
          }
        } else {
          editorDispatch({
            type: "SET_PENDING",
            pending: {
              ...pending,
              chapters: pending.chapters.filter(
                (chapter) => !completedNumbers.has(chapter.chapterNumber),
              ),
            },
          });
        }
      }

      await dispatch(fetchStories());
      const skippedMessage = skipped ? ` Bỏ qua ${skipped} ${label} trùng số.` : "";
      const mergedNote = pending.fromTxt
        ? ` (chia theo ký tự, khoảng ${EPISODE_TARGET_MINUTES} phút/tập)`
        : pending.mergedFrom
          ? ` (gộp từ ${pending.mergedFrom} chương nguồn)`
          : "";
      editorDispatch({
        type: "SAVE_SUCCESS",
        status: `Đã lưu ${saved} ${label} thành công.${skippedMessage}${mergedNote}`,
      });
      const successMessage = pending.fromTxt
        ? `${saved} tập được chia theo ký tự, khoảng ${EPISODE_TARGET_MINUTES} phút/tập.${skippedMessage}`
        : pending.mergedFrom
          ? `${saved} tập gộp từ ${pending.mergedFrom} chương nguồn đã được thêm vào truyện.${skippedMessage}`
          : `${saved} chương đã được thêm vào truyện.${skippedMessage}`;
      return toast.success(
        skipped ? `Đã lưu, bỏ qua ${label} trùng` : "Đã lưu thành công",
        successMessage,
      );
    } catch (error) {
      editorDispatch({
        type: "SAVE_END",
        status: `Đã lưu ${saved}, bỏ qua ${skipped}; còn ${remaining} mục chưa xử lý. ${error.message}`,
      });
      return toast.error(`Không thể lưu hết ${label}`, error.message);
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
            chapterNumber: editing.number,
            title: editing.title || `Chương ${editing.number}`,
            content: form.content.trim(),
          }),
        ).unwrap();
      } else {
        const nextNumber = (story?.chapters || []).reduce((max, c) => Math.max(max, c.number), 0) + 1;
        await dispatch(
          saveChapter({
            storyId: id,
            chapterNumber: nextNumber,
            title: `Chương ${nextNumber}`,
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
