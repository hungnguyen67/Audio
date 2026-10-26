import { configureStore } from "@reduxjs/toolkit";
import { storiesReducer } from "../entities/stories/storiesSlice";

export const store = configureStore({ reducer: { stories: storiesReducer } });
