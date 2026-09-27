import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { setup } from "./lib/telegram";
import "./styles.css";

setup();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
