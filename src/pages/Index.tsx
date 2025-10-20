// index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "/Users/uttej/newswap/src/App";
import "./index.css"; // make sure your global styles are imported

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
