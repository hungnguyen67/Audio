import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { toast } from "../../components/Toast";
import { selectStories } from "../../entities/stories/selectors";
import { deleteStory, fetchStories } from "../../entities/stories/storiesSlice";
import { ChapterEditorModal } from "../chapter-editor/ChapterEditorModal";
import { useChapterEditor } from "../chapter-editor/useChapterEditor";
import { StoriesTable } from "./StoriesTable";

export function AdminStoriesPage() {
  const dispatch = useDispatch();
  const stories = useSelector(selectStories);
  const editor = useChapterEditor();
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [storyToDelete, setStoryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!storyToDelete || deleting) return;
    setDeleting(true);
    try {
      await dispatch(deleteStory(storyToDelete.id)).unwrap();
      await dispatch(fetchStories()).unwrap();
      toast.success(
        `Đã xóa truyện "${storyToDelete.title}"`,
        `${storyToDelete.chapters.length} chương liên quan đã được xóa.`,
      );
    } catch (error) {
      toast.error("Không thể xóa truyện", error.message);
    } finally {
      setDeleting(false);
      setStoryToDelete(null);
    }
  };

  return (
    <>
      <div className="admin-stories-page">
        <div className="page-hero">
          <div>
            <h1 className="hero-title">Kho truyện audio</h1>
            <p className="hero-sub">
              Đang có {stories.length} truyện. Mở truyện để quản lý các tập hoặc tạo truyện mới.
            </p>
          </div>
          <button className="btn btn-dark" onClick={editor.actions.openNew}>
            Tạo truyện
          </button>
        </div>

        <StoriesTable
          stories={stories}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onOpenStory={editor.actions.openStory}
          onDeleteStory={setStoryToDelete}
        />
      </div>

      <ChapterEditorModal editor={editor} />

      {storyToDelete && (
        <ConfirmDialog
          title="Xóa truyện?"
          description={`Truyện "${storyToDelete.title}" cùng toàn bộ chương liên quan sẽ bị xóa vĩnh viễn. Bạn không thể hoàn tác thao tác này.`}
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (!deleting) setStoryToDelete(null);
          }}
        />
      )}
    </>
  );
}
