import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { toast } from "../../components/Toast";
import { deleteChapter, fetchStories } from "../../entities/stories/storiesSlice";
import { useEditorContext } from "./EditorContext";

export function ExistingChapters() {
  const { state, story, dispatch: editorDispatch, actions } = useEditorContext();
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

  const setChecked = (id, value) => editorDispatch({ type: "SET_CHECKED", id, checked: value });

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
      editorDispatch({ type: "SET_CHECKED_IDS", ids: failures.map(({ chapter }) => chapter.id) });
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
    <div className="ch-sub-list">
      <div className="ch-sub-head ch-sub-head-row">
        <span>Các chương hiện có</span>
        <button
          type="button"
          className="btn-small-action"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting || !state.checkedIds.length}
        >
          {deleting ? "Đang xóa..." : `Xóa đã chọn (${state.checkedIds.length})`}
        </button>
      </div>
      <div className="ch-sub-items">
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            className="ch-sub-item"
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
              onPointerDown={(event) => {
                if (event.button !== 0 || deleting) return;
                event.preventDefault();
                const shouldSelect = !checked.has(chapter.id);
                dragSelection.current = shouldSelect;
                setChecked(chapter.id, shouldSelect);
              }}
              onClick={(event) => {
                event.preventDefault();
                if (event.detail === 0) editorDispatch({ type: "TOGGLE_CHECK", id: chapter.id }); // bàn phím
              }}
            />
            <span className="ch-sub-num">{String(chapter.number).padStart(2, "0")}</span>
            <button
              type="button"
              className={`ch-sub-edit-title${state.editing?.id === chapter.id ? " active" : ""}`}
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
