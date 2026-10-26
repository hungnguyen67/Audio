import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./styles/index.css";
import "./styles/player.css";
import "./styles/editor.css";
import { store } from "./app/store";
import { App } from "./app/App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster position="top-right" reverseOrder={false} />
    </Provider>
  </StrictMode>,
);
