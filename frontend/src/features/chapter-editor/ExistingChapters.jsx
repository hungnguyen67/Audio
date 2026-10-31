import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { toast } from "../../components/Toast";
import {
  deleteChapter,
  fetchStories,
} from "../../entities/stories/storiesSlice";
import { useEditorContext } from "./EditorContext";

export function ExistingChapters() {
  const {
    state,
    story,
    dispatch: editorDispatch,
    actions,
  } = useEditorContext();
  const dispatch = useDispatch();
  const dragSelection = useRef(null); // true/false khi đang kéo chọn, null khi không kéo
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const checked = useMemo(() => new Set(state.checkedIds), [state.checkedIds]);
  const chapters = useMemo(
    () => [...(story?.chapters || [])].sort((a, b) => b.number - a.number),
    [story],
  );

  useEffect(() => {
    const stop = () => {
      dragSelection.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  if (!chapters.length) return null;

  const setChecked = (id, value) =>
    editorDispatch({ type: "SET_CHECKED", id, checked: value });

  const deleteSelected = async () => {
    const targets = chapters.filter((chapter) => checked.has(chapter.id));
    if (!targets.length || deleting) return;
    setDeleting(true);
    const deletedIds = [];
    const failures = [];
    try {
      for (const chapter of targets) {
        try {
          await dispatch(deleteChapter(chapter.id)).unwrap();
          deletedIds.push(chapter.id);
        } catch (error) {
          failures.push({ chapter, error });
        }
      }
      editorDispatch({
        type: "SET_CHECKED_IDS",
        ids: failures.map(({ chapter }) => chapter.id),
      });
      if (state.editing && deletedIds.includes(state.editing.id)) {
        editorDispatch({ type: "EDIT_DELETED" });
      }
      await dispatch(fetchStories()).unwrap();
      if (failures.length) {
        const [first] = failures;
        toast.error(
          `Đã xóa ${deletedIds.length}/${targets.length} chương`,
          `Không xóa được chương ${first.chapter.number}: ${first.error.message}`,
        );
      } else {
        toast.success(
          "Đã xóa hàng loạt",
          `${deletedIds.length} chương đã được xóa khỏi truyện "${story.title}".`,
        );
      }
    } catch (error) {
      toast.error(
        `Đã xóa ${deletedIds.length}/${targets.length} chương`,
        `Không thể làm mới danh sách chương: ${error.message}`,
      );
    } finally {
      setConfirmOpen(false);
      setDeleting(false);
    }
  };

  return (
    <div className="mt-0 flex h-full min-h-0 flex-col border-l border-slate-200 pl-5 max-[860px]:border-l-0 max-[860px]:border-t max-[860px]:px-0 max-[860px]:pt-3.5">
      <div className="mb-2 flex items-center justify-between gap-3 pb-0.5 text-xs font-bold uppercase tracking-wider text-slate-600">
        <span>Các chương hiện có</span>
        <button
          type="button"
          className="h-[30px] shrink-0 cursor-pointer rounded-[7px] border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 [font-family:inherit] transition-colors hover:not-disabled:border-slate-300 hover:not-disabled:bg-slate-50 hover:not-disabled:text-slate-900 disabled:cursor-not-allowed disabled:bg-white disabled:text-slate-500"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting || !state.checkedIds.length}
        >
          {deleting
            ? "Đang xóa..."
            : `Xóa đã chọn (${state.checkedIds.length})`}
        </button>
      </div>
      <div className="chapter-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl rounded-tr-none rounded-b-none border border-slate-100 pr-1.5 [scrollbar-gutter:stable]">
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            className="flex min-h-[38px] items-center gap-3 rounded-none border-b border-slate-100 px-2.5 py-2 text-[13px] text-slate-700 transition-colors last:border-b-0 hover:bg-slate-50"
            onPointerEnter={(event) => {
              if (dragSelection.current !== null && event.buttons === 1) {
                setChecked(chapter.id, dragSelection.current);
              }
            }}
          >
            <input
              type="checkbox"
              aria-label={`Chọn chương ${chapter.number}: ${chapter.title}`}
              checked={checked.has(chapter.id)}
              disabled={deleting}
              className="size-4 shrink-0 cursor-pointer rounded border border-slate-300 accent-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-55"
              onPointerDown={(event) => {
                if (event.button !== 0 || deleting) return;
                event.preventDefault();
                const shouldSelect = !checked.has(chapter.id);
                dragSelection.current = shouldSelect;
                setChecked(chapter.id, shouldSelect);
              }}
              onClick={(event) => {
                event.preventDefault();
                if (event.detail === 0)
                  editorDispatch({ type: "TOGGLE_CHECK", id: chapter.id }); // bàn phím
              }}
            />
            <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">
              {String(chapter.number).padStart(2, "0")}
            </span>
            <button
              type="button"
              className={`min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[13px] text-slate-600 [font-family:inherit] hover:text-slate-900 ${
                state.editing?.id === chapter.id
                  ? "font-bold text-slate-900"
                  : ""
              }`}
              onClick={() => actions.openChapter(story, chapter)}
            >
              {chapter.title}
            </button>
          </div>
        ))}
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title={`Xóa ${state.checkedIds.length} chương?`}
          description={`Các chương đã chọn trong truyện "${story.title}" sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.`}
          busy={deleting}
          onConfirm={deleteSelected}
          onCancel={() => {
            if (!deleting) setConfirmOpen(false);
          }}
        />
      )}
    </div>
  );
}
