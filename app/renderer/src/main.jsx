import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import "./styles.css";

const TYPES = [
  { id: "all", label: "全部" },
  { id: "worklog", label: "工作记录" },
  { id: "todo", label: "待办" },
  { id: "idea", label: "灵感" },
  { id: "report", label: "总结" }
];

const TYPE_LABELS = TYPES.reduce((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {});

function App() {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState([]);
  const [shortcut, setShortcut] = useState("Alt+Q");
  const [shortcutHint, setShortcutHint] = useState("");
  const [shortcutCapture, setShortcutCapture] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState("root");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorValue, setEditorValue] = useState("");
  const [editorType, setEditorType] = useState("worklog");
  const [editorTypeMenuOpen, setEditorTypeMenuOpen] = useState(false);
  const [editorCreatedAt, setEditorCreatedAt] = useState("");
  const [reporting, setReporting] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState("day");
  const [reportDate, setReportDate] = useState("");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [reportError, setReportError] = useState("");
  const [aiProvider, setAiProvider] = useState("qwen");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [promptDay, setPromptDay] = useState("");
  const [promptWeek, setPromptWeek] = useState("");
  const [settingsHint, setSettingsHint] = useState("");
  const editorRef = React.useRef(null);
  const editorTypeMenuRef = React.useRef(null);

  const refresh = async () => {
    const data = await window.api.listNotes({ type, query, limit: 200 });
    setNotes(data);
  };

  useEffect(() => {
    refresh();
  }, [type, query]);

  useEffect(() => {
    window.api.onMainRefresh(() => {
      refresh();
    });
  }, []);

  useEffect(() => {
    window.api.getShortcut().then((res) => {
      if (res?.shortcut) setShortcut(res.shortcut);
    });
  }, []);

  useEffect(() => {
    window.api.getSettings().then((res) => {
      if (!res) return;
      if (res.ai) {
        setAiProvider(res.ai.provider || "qwen");
        setAiApiKey(res.ai.apiKey || "");
        setAiBaseUrl(res.ai.baseUrl || "");
        setAiModel(res.ai.model || "");
      }
      if (res.prompts) {
        setPromptDay(res.prompts.day || "");
        setPromptWeek(res.prompts.week || "");
      }
    });
  }, []);

  useEffect(() => {
    if (!editorTypeMenuOpen) return;
    const onPointerDown = (event) => {
      if (!editorTypeMenuRef.current) return;
      if (!editorTypeMenuRef.current.contains(event.target)) {
        setEditorTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [editorTypeMenuOpen]);

  const handleDelete = async (id) => {
    const ok = window.confirm("确定要删除这条记录吗？");
    if (!ok) return;
    await window.api.deleteNote({ id });
    await refresh();
  };

  const handleToggleDone = async (note) => {
    const next = note.status === "done" ? "open" : "done";
    await window.api.updateStatus({ id: note.id, status: next });
    await refresh();
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

  const toDateTimeLocal = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const openEditor = (note) => {
    setEditingNote(note);
    setEditorTitle(deriveTitle(note));
    setEditorValue(normalizeContentHtml(note.content || ""));
    setEditorType(note.type || "worklog");
    setEditorTypeMenuOpen(false);
    setEditorCreatedAt(toDateTimeLocal(note.created_at));
    setTimeout(() => {
      if (editorRef.current) editorRef.current.focus();
    }, 0);
  };

  const closeEditor = () => {
    setEditingNote(null);
    setEditorTitle("");
    setEditorValue("");
    setEditorType("worklog");
    setEditorTypeMenuOpen(false);
    setEditorCreatedAt("");
  };

  const saveEditor = async () => {
    if (!editingNote) return;
    const title = editorTitle.trim();
    const content = editorValue || "";
    const parsedCreatedAt = editorCreatedAt ? new Date(editorCreatedAt) : null;
    const createdAt =
      parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime())
        ? parsedCreatedAt.toISOString()
        : editingNote.created_at;
    await window.api.updateNote({
      id: editingNote.id,
      title,
      content,
      type: editorType || editingNote.type,
      created_at: createdAt
    });
    await refresh();
    closeEditor();
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      ["blockquote", "code-block"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ indent: "-1" }, { indent: "+1" }],
      ["link", "clean"]
    ]
  };

  const quillFormats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "blockquote",
    "code-block",
    "list",
    "indent",
    "link"
  ];

  const applyShortcut = async () => {
    setShortcutHint("");
    const res = await window.api.setShortcut({ shortcut });
    if (res?.ok) {
      setShortcutHint("已更新");
    } else {
      setShortcutHint("设置失败");
    }
  };

  const saveSettings = async () => {
    setSettingsHint("");
    const payload = {
      ai: {
        provider: aiProvider,
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel
      },
      prompts: {
        day: promptDay,
        week: promptWeek
      }
    };
    const res = await window.api.updateSettings(payload);
    if (res?.ok) {
      setSettingsHint("已保存");
      setSettingsView("root");
      return true;
    } else {
      setSettingsHint("保存失败");
      return false;
    }
  };

  const generateReport = async (nextRange) => {
    if (reporting) return;
    setReportType(nextRange);
    const today = new Date();
    const toDateInput = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    if (nextRange === "day") {
      setReportDate(toDateInput(today));
    } else {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      setReportStart(toDateInput(start));
      setReportEnd(toDateInput(today));
    }
    setReportError("");
    setShowReportModal(true);
  };

  const buildDateRange = () => {
    if (reportType === "day") {
      if (!reportDate) return null;
      const from = new Date(`${reportDate}T00:00:00`);
      const to = new Date(`${reportDate}T23:59:59.999`);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (!reportStart || !reportEnd) return null;
    const from = new Date(`${reportStart}T00:00:00`);
    const to = new Date(`${reportEnd}T23:59:59.999`);
    return { from: from.toISOString(), to: to.toISOString() };
  };

  const confirmReportGenerate = async () => {
    if (reporting) return;
    const range = buildDateRange();
    if (!range) {
      setReportError("请选择有效日期。");
      return;
    }
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    if (toDate < fromDate) {
      setReportError("结束日期不能早于开始日期。");
      return;
    }
    if (reportType === "week") {
      const diffMs = toDate.getTime() - fromDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 14) {
        setReportError("周报日期范围不能超过 2 周。");
        return;
      }
    }
    setReportError("");
    setReporting(reportType);
    const res = await window.api.generateReport({ range: reportType, ...range });
    if (res?.ok) {
      await refresh();
      setShowReportModal(false);
    } else if (res?.error === "missing_api_key") {
      window.alert("请先在设置中填写 Qwen API Key。");
    } else if (res?.error === "no_notes") {
      window.alert("当前区间没有可总结的记录。");
    } else if (res?.error === "range_too_long") {
      setReportError("周报日期范围不能超过 2 周。");
    } else {
      window.alert("总结失败，请检查设置或网络。");
    }
    setReporting("");
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

  const getTagLabel = (note) => {
    if (note.type === "report") {
      return note.tags === "day" ? "日报" : "周报";
    }
    return TYPE_LABELS[note.type] || note.type;
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
          <div className="report-actions">
            <button className="btn" onClick={() => generateReport("day")} disabled={reporting === "day"}>
              {reporting === "day" ? "生成中..." : "生成日报"}
            </button>
            <button className="btn" onClick={() => generateReport("week")} disabled={reporting === "week"}>
              {reporting === "week" ? "生成中..." : "生成周报"}
            </button>
          </div>
        </div>
        <button className="settings-btn" onClick={() => {
          setSettingsView("root");
          setShowSettings(true);
        }}>设置</button>
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

        <div className="content-body">
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
                        <span className={`tag tag-${n.type}`}>{getTagLabel(n)}</span>
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
              <div className={`editor-select-wrap ${editorTypeMenuOpen ? "open" : ""}`} ref={editorTypeMenuRef}>
                <button
                  type="button"
                  className={`editor-select ${editorTypeMenuOpen ? "open" : ""}`}
                  onClick={() => setEditorTypeMenuOpen((v) => !v)}
                >
                  <span>{TYPE_LABELS[editorType] || editorType}</span>
                </button>
                {editorTypeMenuOpen ? (
                  <div className="editor-select-menu">
                    {TYPES.filter((t) => t.id !== "all").map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`editor-select-option ${editorType === t.id ? "active" : ""}`}
                        onClick={() => {
                          setEditorType(t.id);
                          setEditorTypeMenuOpen(false);
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <input
                className="editor-datetime"
                type="datetime-local"
                value={editorCreatedAt}
                onChange={(e) => setEditorCreatedAt(e.target.value)}
              />
              <div className="editor-actions">
                <button className="btn ghost" onClick={closeEditor}>取消</button>
                <button className="btn" onClick={saveEditor}>保存</button>
              </div>
            </div>
            <div className="editor-toolbar">
              <ReactQuill
                theme="snow"
                value={editorValue}
                onChange={setEditorValue}
                modules={quillModules}
                formats={quillFormats}
                ref={editorRef}
              />
            </div>
            <div className="editor-foot">双击卡片或点击“打开”进入编辑</div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="settings-mask" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <div className="settings-title">设置</div>
              <button className="btn ghost" onClick={() => setShowSettings(false)}>关闭</button>
            </div>
            {settingsView === "root" ? (
              <div className="settings-root">
                <button className="settings-entry" onClick={() => setSettingsView("shortcut")}>
                  <div className="settings-entry-title">快捷键设置</div>
                  <div className="settings-entry-desc">配置全局快速输入快捷键</div>
                </button>
                <button className="settings-entry" onClick={() => setSettingsView("model")}>
                  <div className="settings-entry-title">模型设置</div>
                  <div className="settings-entry-desc">配置 AI 模型与日报/周报 Prompt</div>
                </button>
              </div>
            ) : (
              <div className="settings-body">
                <div className="settings-subhead">
                  <button className="btn ghost" onClick={() => setSettingsView("root")}>返回</button>
                  <div className="settings-subtitle">
                    {settingsView === "shortcut" ? "快捷键设置" : "模型设置"}
                  </div>
                </div>
                {settingsView === "shortcut" ? (
                  <div className="settings-item">
                    <div className="settings-label">快捷键</div>
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
                ) : (
                  <>
                    <div className="settings-item">
                      <div className="settings-label">AI 模型（当前仅支持 Qwen）</div>
                      <div className="settings-grid">
                        <div className="settings-field">
                          <label>Provider</label>
                          <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
                            <option value="qwen">qwen</option>
                          </select>
                        </div>
                        <div className="settings-field">
                          <label>API Key</label>
                          <input
                            type="password"
                            value={aiApiKey}
                            onChange={(e) => setAiApiKey(e.target.value)}
                            placeholder="填写 Qwen API Key"
                          />
                        </div>
                        <div className="settings-field">
                          <label>Base URL</label>
                          <input
                            value={aiBaseUrl}
                            onChange={(e) => setAiBaseUrl(e.target.value)}
                            placeholder="https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
                          />
                        </div>
                        <div className="settings-field">
                          <label>Model</label>
                          <input
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            placeholder="qwen-plus"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="settings-item">
                      <div className="settings-label">日报 Prompt</div>
                      <textarea
                        className="settings-textarea"
                        rows={5}
                        value={promptDay}
                        onChange={(e) => setPromptDay(e.target.value)}
                      />
                      <div className="hint">支持占位符：{"{{from}}"}、{"{{to}}"}、{"{{notes}}"}</div>
                    </div>
                    <div className="settings-item">
                      <div className="settings-label">周报 Prompt</div>
                      <textarea
                        className="settings-textarea"
                        rows={5}
                        value={promptWeek}
                        onChange={(e) => setPromptWeek(e.target.value)}
                      />
                      <div className="hint">支持占位符：{"{{from}}"}、{"{{to}}"}、{"{{notes}}"}</div>
                    </div>
                    <div className="settings-actions">
                      <button className="btn" onClick={saveSettings}>保存设置</button>
                      {settingsHint ? <div className="hint">{settingsHint}</div> : null}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showReportModal ? (
        <div className="settings-mask" onClick={() => setShowReportModal(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <div className="settings-title">{reportType === "day" ? "生成日报" : "生成周报"}</div>
              <button className="btn ghost" onClick={() => setShowReportModal(false)}>关闭</button>
            </div>
            <div className="settings-body">
              {reportType === "day" ? (
                <div className="settings-item">
                  <div className="settings-label">选择日期</div>
                  <input
                    className="setting-input"
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="settings-item">
                  <div className="settings-label">选择日期范围（最多 2 周）</div>
                  <div className="settings-grid">
                    <div className="settings-field">
                      <label>开始日期</label>
                      <input
                        type="date"
                        value={reportStart}
                        onChange={(e) => setReportStart(e.target.value)}
                      />
                    </div>
                    <div className="settings-field">
                      <label>结束日期</label>
                      <input
                        type="date"
                        value={reportEnd}
                        onChange={(e) => setReportEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
              {reportError ? <div className="hint">{reportError}</div> : null}
              <div className="settings-actions">
                <button className="btn" onClick={confirmReportGenerate} disabled={reporting !== ""}>
                  {reporting ? "生成中..." : "确定生成"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);


