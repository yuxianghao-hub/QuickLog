import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./quick.css";

const TYPES = [
  { id: "worklog", label: "工作记录" },
  { id: "todo", label: "待办" },
  { id: "idea", label: "灵感" }
];

function QuickInput() {
  const [type, setType] = useState("worklog");
  const [content, setContent] = useState("");
  const inputRef = useRef(null);

  const focusInput = () => {
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    focusInput();
    window.api.onQuickFocus(() => focusInput());
  }, []);

  const submit = async () => {
    if (!content.trim()) return;
    const text = content.trim();
    const firstLine = text.split(/\r?\n/)[0].trim();
    const title = firstLine || "（无标题）";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    const html = `<p>${escaped}</p>`;
    await window.api.addNote({
      type,
      title,
      content: html,
      status: type === "worklog" ? "open" : null
    });
    setContent("");
    await window.api.hideQuick();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      window.api.hideQuick();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const idx = TYPES.findIndex((t) => t.id === type);
      const next = TYPES[(idx + 1) % TYPES.length].id;
      setType(next);
    }
  };

  return (
    <div className="quick-shell" tabIndex={-1}>
      <div className="quick-card">
        <div className="quick-tabs">
          {TYPES.map((t) => (
            <button
              key={t.id}
              className={`qtab ${type === t.id ? "active" : ""}`}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          ref={inputRef}
          className="quick-input"
          placeholder="支持换行输入；Ctrl/Cmd+Enter 保存，Esc 关闭"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
        />
        <div className="quick-footer">
          <span>Tab 切换分类，Ctrl/Cmd+Enter 保存</span>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<QuickInput />);
