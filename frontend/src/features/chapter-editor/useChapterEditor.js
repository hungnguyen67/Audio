import { useMemo, useReducer, useRef } from "react";
import { useSelector } from "react-redux";
import { chaptersApi } from "../../api/chapters";
import { selectStoryById } from "../../entities/stories/selectors";
import { editorReducer, initialEditorState } from "./editorReducer";

export function useChapterEditor() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const story = useSelector(selectStoryById(state.storyId));
  const openToken = useRef(0); // bỏ kết quả tải nội dung chương cũ nếu đã mở/đóng cái khác

  const actions = useMemo(
    () => ({
      openNew() {
        openToken.current += 1;
        dispatch({ type: "OPEN" });
      },
      openStory(target) {
        openToken.current += 1;
        dispatch({ type: "OPEN", story: target });
      },
      async openChapter(target, chapter) {
        const token = (openToken.current += 1);
        dispatch({ type: "OPEN", story: target, chapter });
        try {
          const data = await chaptersApi.get(chapter.id);
          if (token === openToken.current) {
            dispatch({ type: "PATCH_FORM", patch: { title: data.title, content: data.content } });
          }
        } catch (error) {
          if (token === openToken.current) dispatch({ type: "SET_STATUS", status: error.message });
        }
      },
      close() {
        openToken.current += 1;
        dispatch({ type: "CLOSE" });
      },
      cancelEdit(target) {
        dispatch({ type: "CANCEL_EDIT", storyTitle: target?.title ?? "" });
      },
    }),
    [],
  );

  return { state, dispatch, story, actions, busy: state.importing || state.saving };
}
