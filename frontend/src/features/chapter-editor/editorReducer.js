const emptyForm = { story: "", number: "", title: "", content: "" };
const emptyPending = { chapters: [], mergedFrom: 0 };

export const initialEditorState = {
  open: false,
  storyId: null,
  editing: null, // chương đang sửa
  form: emptyForm,
  status: "",
  checkedIds: [], // chương được tick để xoá hàng loạt
  pending: emptyPending, // các tập đã import, chờ lưu
  importing: false,
  importStatus: "",
  saving: false,
};

export function editorReducer(state, action) {
  switch (action.type) {
    case "OPEN": {
      const { story, chapter } = action;
      return {
        ...initialEditorState,
        open: true,
        storyId: story?.id ?? null,
        editing: chapter ?? null,
        form: {
          story: story?.title ?? "",
          number: chapter ? String(chapter.number) : "",
          title: chapter?.title ?? "",
          content: "",
        },
      };
    }
    case "CLOSE":
      return initialEditorState;
    case "CANCEL_EDIT":
      return { ...state, editing: null, status: "", form: { ...emptyForm, story: action.storyTitle } };

    case "SET_FIELD":
      return { ...state, form: { ...state.form, [action.field]: action.value } };
    case "PATCH_FORM":
      return { ...state, form: { ...state.form, ...action.patch } };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "SET_STORY_ID":
      return { ...state, storyId: action.storyId };
    case "EDIT_DELETED":
      return { ...state, editing: null };

    case "TOGGLE_CHECK": {
      const checked = state.checkedIds.includes(action.id);
      return {
        ...state,
        checkedIds: checked
          ? state.checkedIds.filter((id) => id !== action.id)
          : [...state.checkedIds, action.id],
      };
    }
    case "SET_CHECKED": {
      if (state.checkedIds.includes(action.id) === action.checked) return state;
      return {
        ...state,
        checkedIds: action.checked
          ? [...state.checkedIds, action.id]
          : state.checkedIds.filter((id) => id !== action.id),
      };
    }
    case "SET_CHECKED_IDS":
      return { ...state, checkedIds: action.ids };

    case "IMPORT_START":
      return { ...state, importing: true, pending: emptyPending };
    case "IMPORT_MESSAGE":
      return { ...state, importStatus: action.message };
    case "IMPORT_FINISH":
      return {
        ...state,
        importing: false,
        importStatus: action.message,
        pending: action.pending ?? state.pending,
        form: action.patch ? { ...state.form, ...action.patch } : state.form,
      };

    case "SAVE_START":
      return { ...state, saving: true };
    case "SET_PENDING":
      return { ...state, pending: action.pending };
    case "SAVE_SUCCESS":
      return {
        ...state,
        saving: false,
        editing: null,
        pending: emptyPending,
        status: action.status,
        form: { ...state.form, number: "", title: "", content: "" },
      };
    case "SAVE_END":
      return { ...state, saving: false, status: action.status ?? state.status };
    default:
      return state;
  }
}
