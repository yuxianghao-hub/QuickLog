import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const TYPES = [
  { id: "all", label: "全部" },
  { id: "worklog", label: "工作记录" },
  { id: "todo", label: "待办" },
  { id: "idea", label: "灵感" }
];

function App() {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState([]);
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState("week");
  const [shortcut, setShortcut] = useState("Alt+Q");
  const [shortcutHint, setShortcutHint] = useState("");
  const [shortcutCapture, setShortcutCapture] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [editorTitle, setEditorTitle] = useState("");
  const editorRef = React.useRef(null);

  const refresh = async () => {
    const data = await window.api.listNotes({ type, query, limit: 200 });
    setNotes(data);
  };

  const refreshStats = async () => {
    const data = await window.api.getStats({ range });
    setStats(data);
  };

  useEffect(() => {
    refresh();
  }, [type, query]);

  useEffect(() => {
    refreshStats();
  }, [range]);

  useEffect(() => {
    window.api.onMainRefresh(() => {
      refresh();
      refreshStats();
    });
  }, []);

  useEffect(() => {
    window.api.getShortcut().then((res) => {
      if (res?.shortcut) setShortcut(res.shortcut);
    });
  }, []);

  const handleDelete = async (id) => {
    const ok = window.confirm("确定要删除这条记录吗？");
    if (!ok) return;
    await window.api.deleteNote({ id });
    await refresh();
    await refreshStats();
  };

  const handleToggleDone = async (note) => {
    const next = note.status === "done" ? "open" : "done";
    await window.api.updateStatus({ id: note.id, status: next });
    await refresh();
    await refreshStats();
  };

  const stripHtml = (html) => {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  };

  const deriveTitle = (note) => {
    if (note.title && note.title.trim()) return note.title.trim();
    const plain = stripHtml(note.content || "");
    if (!plain) return "（无标题）";
    const firstLine = plain.split(/\r?\n/)[0].trim();
    return firstLine || "（无标题）";
  };

  const normalizeContentHtml = (content) => {
    if (!content) return "<p></p>";
    if (content.includes("<") && content.includes(">")) return content;
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    return `<p>${escaped}</p>`;
  };

  const openEditor = (note) => {
    setEditingNote(note);
    setEditorTitle(deriveTitle(note));
    setTimeout(() => {
      if (editorRef.current) editorRef.current.focus();
    }, 0);
  };

  const closeEditor = () => {
    setEditingNote(null);
    setEditorTitle("");
  };

  const execCmd = (cmd, value = null) => {
    try {
      document.execCommand(cmd, false, value);
    } catch (err) {
      // ignore
    }
  };

  const saveEditor = async () => {
    if (!editingNote) return;
    const title = editorTitle.trim();
    const content = editorRef.current ? editorRef.current.innerHTML : "";
    await window.api.updateNote({ id: editingNote.id, title, content });
    await refresh();
    await refreshStats();
    closeEditor();
  };

  useEffect(() => {
    if (!editingNote || !editorRef.current) return;
    editorRef.current.innerHTML = normalizeContentHtml(editingNote.content || "");
  }, [editingNote]);

  const todoRate = useMemo(() => {
    if (!stats) return "-";
    if (!stats.todo.total) return "0%";
    return `${Math.round((stats.todo.done / stats.todo.total) * 100)}%`;
  }, [stats]);

  const applyShortcut = async () => {
    setShortcutHint("");
    const res = await window.api.setShortcut({ shortcut });
    if (res?.ok) {
      setShortcutHint("已更新");
    } else {
      setShortcutHint("设置失败");
    }
  };

  const normalizeKey = (event) => {
    const { key } = event;
    if (!key) return "";
    const lower = key.toLowerCase();
    if (lower === "control" || lower === "alt" || lower === "shift" || lower === "meta") {
      return "";
    }
    if (lower === " ") return "Space";
    if (lower === "arrowup") return "Up";
    if (lower === "arrowdown") return "Down";
    if (lower === "arrowleft") return "Left";
    if (lower === "arrowright") return "Right";
    if (lower === "escape") return "Esc";
    if (lower === "pageup") return "PageUp";
    if (lower === "pagedown") return "PageDown";
    if (lower === "backspace") return "Backspace";
    if (lower === "delete") return "Delete";
    if (lower === "insert") return "Insert";
    if (lower === "home") return "Home";
    if (lower === "end") return "End";
    if (lower === "tab") return "Tab";
    if (lower === "=") return "Plus";
    if (lower === "-") return "Minus";
    if (lower === "`") return "`";
    if (lower === "\\") return "\\";
    if (lower.length === 1) return lower.toUpperCase();
    return key;
  };

  const buildAccelerator = (event) => {
    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    const k = normalizeKey(event);
    if (!k) return "";
    parts.push(k);
    return parts.join("+");
  };

  const onShortcutKeyDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setShortcutCapture(false);
      return;
    }
    const next = buildAccelerator(event);
    if (!next) return;
    setShortcut(next);
    setShortcutCapture(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">QuickLog</div>
        <div className="section">
          <div className="section-title">分类</div>
          {TYPES.map((t) => (
            <button
              key={t.id}
              className={`nav-btn ${type === t.id ? "active" : ""}`}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="section">
          <div className="section-title">报告</div>
          <div className="chip-row">
            <button className={`chip ${range === "day" ? "active" : ""}`} onClick={() => setRange("day")}>日报</button>
            <button className={`chip ${range === "week" ? "active" : ""}`} onClick={() => setRange("week")}>周报</button>
          </div>
          <div className="stats-box">
            <div className="stat">
              <div className="stat-label">新增</div>
              <div className="stat-value">{stats ? stats.total : "-"}</div>
            </div>
            <div className="stat">
              <div className="stat-label">待办完成率</div>
              <div className="stat-value">{todoRate}</div>
            </div>
            <div className="stat">
              <div className="stat-label">区间起始</div>
              <div className="stat-small">{stats ? new Date(stats.from).toLocaleString() : "-"}</div>
            </div>
          </div>
        </div>
        <div className="section">
          <div className="section-title">快捷键</div>
          <div className="setting-row">
            <input
              className="setting-input"
              value={shortcut}
              readOnly
              placeholder="点击后按下组合键"
              onFocus={() => setShortcutCapture(true)}
              onBlur={() => setShortcutCapture(false)}
              onKeyDown={onShortcutKeyDown}
            />
            <button className="btn" onClick={applyShortcut}>应用</button>
            <button className="btn ghost" onClick={() => setShortcut("Alt+Q")}>重置</button>
          </div>
          {shortcutCapture ? <div className="hint">按下组合键（Esc 取消）</div> : null}
          {shortcutHint ? <div className="hint">{shortcutHint}</div> : null}
        </div>
      </aside>

      <main className="content">
        <header className="toolbar">
          <input
            className="search"
            placeholder="搜索内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="hint">快捷键: {shortcut || "Alt+Q"}</div>
        </header>

        <div className="list">
          {(() => {
            let lastDate = "";
            const formatDate = (date) =>
              date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
            return notes.map((n) => {
              const d = new Date(n.created_at);
              const dateLabel = formatDate(d);
              const showDivider = dateLabel !== lastDate;
              if (showDivider) lastDate = dateLabel;
              return (
                <React.Fragment key={n.id}>
                  {showDivider ? (
                    <div className="date-divider">
                      <span className="date-label">{dateLabel}</span>
                      <span className="date-line" />
                    </div>
                  ) : null}
                  <div className="card" onDoubleClick={() => openEditor(n)}>
                    <div className="card-head">
                      <span className={`tag tag-${n.type}`}>{n.type}</span>
                      <span className="time">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <div className="card-body">{deriveTitle(n)}</div>
                    <div className="card-foot">
                      {n.type === "todo" ? (
                        <button className={`btn ${n.status === "done" ? "ghost" : ""}`} onClick={() => handleToggleDone(n)}>
                          {n.status === "done" ? "标记未完成" : "完成"}
                        </button>
                      ) : null}
                      <button className="btn" onClick={() => openEditor(n)}>打开</button>
                      <button className="btn danger" onClick={() => handleDelete(n.id)}>删除</button>
                      {n.status ? <span className="status">状态: {n.status}</span> : null}
                    </div>
                  </div>
                </React.Fragment>
              );
            });
          })()}
          {notes.length === 0 ? <div className="empty">暂无记录</div> : null}
        </div>
      </main>

      {editingNote ? (
        <div className="editor-mask" onClick={closeEditor}>
          <div className="editor" onClick={(e) => e.stopPropagation()}>
            <div className="editor-head">
              <input
                className="editor-title"
                value={editorTitle}
                onChange={(e) => setEditorTitle(e.target.value)}
                placeholder="标题"
              />
              <div className="editor-actions">
                <button className="btn ghost" onClick={closeEditor}>取消</button>
                <button className="btn" onClick={saveEditor}>保存</button>
              </div>
            </div>
            <div className="editor-toolbar">
              <button className="tool" onClick={() => execCmd("bold")}>B</button>
              <button className="tool" onClick={() => execCmd("italic")}>I</button>
              <button className="tool" onClick={() => execCmd("underline")}>U</button>
              <button className="tool" onClick={() => execCmd("strikeThrough")}>S</button>
              <span className="tool-sep" />
              <button className="tool" onClick={() => execCmd("formatBlock", "h1")}>H1</button>
              <button className="tool" onClick={() => execCmd("formatBlock", "h2")}>H2</button>
              <button className="tool" onClick={() => execCmd("formatBlock", "blockquote")}>“</button>
              <button className="tool" onClick={() => execCmd("insertUnorderedList")}>•</button>
              <button className="tool" onClick={() => execCmd("insertOrderedList")}>1.</button>
              <button
                className="tool"
                onClick={() => {
                  const url = window.prompt("输入链接地址");
                  if (url) execCmd("createLink", url);
                }}
              >
                ↗
              </button>
              <button className="tool" onClick={() => execCmd("removeFormat")}>清除</button>
            </div>
            <div
              className="editor-body"
              contentEditable
              ref={editorRef}
            />
            <div className="editor-foot">双击卡片或点击“打开”进入编辑</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
