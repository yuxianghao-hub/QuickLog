const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

let mainWindow;
let quickWindow;
let tray;
let db;
const defaultSettings = {
  shortcut: "Alt+Q",
  ai: {
    provider: "qwen",
    apiKey: "",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    model: "qwen-plus"
  },
  prompts: {
    day:
      "你是工作日志助手。基于以下当天记录生成结构化日报，包含：今日完成、进行中、问题/风险、明日计划。要求简洁、要点列表。时间范围：{{from}} ~ {{to}}。\n记录如下：\n{{notes}}",
    week:
      "你是工作日志助手。基于以下一周记录生成结构化周报，包含：本周完成、进行中、问题/风险、下周计划。要求简洁、要点列表。时间范围：{{from}} ~ {{to}}。\n记录如下：\n{{notes}}"
  }
};
let settings = { ...defaultSettings };

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    ensureMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function initLogging() {
  try {
    const logDir = app.getPath("userData");
    const logPath = path.join(logDir, "quicklog.log");
    const write = (level, message) => {
      const line = `[${new Date().toISOString()}] [${level}] ${message}
`;
      fs.appendFileSync(logPath, line, "utf8");
    };

    console.log = (...args) => {
      write("INFO", args.map(String).join(" "));
    };
    console.warn = (...args) => {
      write("WARN", args.map(String).join(" "));
    };
    console.error = (...args) => {
      write("ERROR", args.map(String).join(" "));
    };

    process.on("uncaughtException", (err) => {
      write("FATAL", err && err.stack ? err.stack : String(err));
    });
    process.on("unhandledRejection", (err) => {
      write("FATAL", err && err.stack ? err.stack : String(err));
    });

    write("INFO", "QuickLog main process logging started.");
  } catch (err) {
    // ignore logging failures
  }
}

function ensureMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      settings = {
        ...defaultSettings,
        ...data,
        ai: { ...defaultSettings.ai, ...(data.ai || {}) },
        prompts: { ...defaultSettings.prompts, ...(data.prompts || {}) }
      };
    }
  } catch (err) {
    // ignore, keep defaults
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.warn("Save settings failed:", err);
  }
}

function ensureQuickWindow() {
  if (!quickWindow || quickWindow.isDestroyed()) {
    createQuickWindow();
  }
}

function ensureDb() {
  const dataDir = path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "app.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      tags TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
  `);
  const columns = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!columns.includes("title")) {
    db.exec("ALTER TABLE notes ADD COLUMN title TEXT");
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    title: "QuickLog",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/index.html`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer-dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("main:refresh");
    }
  });
}

function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: 520,
    height: 320,
    show: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    transparent: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    title: "QuickLog Quick Input",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    quickWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/quick.html`);
  } else {
    quickWindow.loadFile(path.join(__dirname, "..", "renderer-dist", "quick.html"));
  }

  quickWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      quickWindow.hide();
    }
  });
}

function showQuickWindow() {
  ensureQuickWindow();
  if (!quickWindow) return;
  quickWindow.setOpacity(0);
  quickWindow.center();
  quickWindow.show();
  quickWindow.focus();
  setTimeout(() => {
    if (quickWindow && !quickWindow.isDestroyed()) {
      quickWindow.setOpacity(1);
      quickWindow.webContents.send("quick:focus");
    }
  }, 30);
}

function toggleQuickWindow() {
  if (!quickWindow || quickWindow.isDestroyed()) {
    createQuickWindow();
  }
  if (quickWindow.isVisible()) {
    quickWindow.hide();
  } else {
    showQuickWindow();
  }
}

function registerShortcuts() {
  const accelerator = settings.shortcut || "Alt+Q";
  let registered = false;
  try {
    const ok = globalShortcut.register(accelerator, () => {
      toggleQuickWindow();
    });
    if (ok) {
      registered = true;
      console.log(`Global shortcut registered: ${accelerator}`);
    }
  } catch (err) {
    console.warn(`Global shortcut error for ${accelerator}:`, err);
  }

  if (!registered) {
    console.warn(`Global shortcut registration failed: ${accelerator}`);
  }
  return registered;
}

function applyShortcut(accelerator) {
  const next = typeof accelerator === "string" ? accelerator.trim() : "";
  if (!next) return { ok: false, error: "invalid" };

  const previous = settings.shortcut || "Alt+Q";
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.warn("Global shortcut unregisterAll failed:", err);
  }

  try {
    const ok = globalShortcut.register(next, () => {
      toggleQuickWindow();
    });
    if (ok) {
      settings.shortcut = next;
      saveSettings();
      console.log(`Global shortcut updated: ${next}`);
      return { ok: true };
    }
  } catch (err) {
    console.warn(`Global shortcut error for ${next}:`, err);
  }

  try {
    if (previous) {
      globalShortcut.register(previous, () => {
        toggleQuickWindow();
      });
    }
  } catch (err) {
    console.warn(`Global shortcut restore failed for ${previous}:`, err);
  }
  return { ok: false, error: "register_failed" };
}

function stripHtml(input) {
  if (!input) return "";
  return String(input)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function formatRangeDate(value) {
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch (err) {
    return String(value);
  }
}

function buildPrompt(template, from, to, notesText) {
  return template
    .replace(/{{from}}/g, from)
    .replace(/{{to}}/g, to)
    .replace(/{{notes}}/g, notesText);
}

function toHtml(text) {
  if (!text) return "<p></p>";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
}

async function callQwen({ apiKey, baseUrl, model, prompt }) {
  if (!apiKey) return { ok: false, error: "missing_api_key" };
  if (!globalThis.fetch) return { ok: false, error: "fetch_unavailable" };
  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: { prompt }
      })
    });

    if (!res.ok) {
      const raw = await res.text();
      return { ok: false, error: "http_error", detail: raw };
    }

    const data = await res.json();
    const text =
      data?.output?.text ||
      data?.output?.choices?.[0]?.message?.content ||
      data?.output?.choices?.[0]?.text ||
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.result ||
      "";
    if (!text) return { ok: false, error: "empty_response", detail: data };
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      error: "network_error",
      detail: err && err.message ? err.message : String(err)
    };
  }
}

function normalizeRangeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function generateReport(range, fromOverride, toOverride) {
  const now = new Date();
  let fromDate;
  let toDate;

  const fromIso = normalizeRangeInput(fromOverride);
  const toIso = normalizeRangeInput(toOverride);

  if (fromIso && toIso) {
    fromDate = new Date(fromIso);
    toDate = new Date(toIso);
  } else {
    fromDate = new Date(now);
    toDate = new Date(now);
    if (range === "day") {
      fromDate.setDate(now.getDate() - 1);
    } else {
      fromDate.setDate(now.getDate() - 7);
    }
  }

  const from = fromDate.toISOString();
  const to = toDate.toISOString();

  if (range === "week") {
    const diffMs = Math.abs(toDate.getTime() - fromDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 14) {
      return { ok: false, error: "range_too_long" };
    }
  }

  const rows = db
    .prepare(
      "SELECT type, title, content, created_at FROM notes WHERE created_at >= ? AND created_at <= ? AND type != 'report' ORDER BY datetime(created_at) ASC"
    )
    .all(from, to);

  if (!rows.length) {
    return { ok: false, error: "no_notes" };
  }

  const notesText = rows
    .map((row) => {
      const created = formatRangeDate(row.created_at);
      const title = row.title && row.title.trim() ? row.title.trim() : "";
      const content = stripHtml(row.content || "");
      const short = content.length > 400 ? `${content.slice(0, 400)}...` : content;
      return `- [${created}] [${row.type}] ${title}\n${short}`.trim();
    })
    .join("\n");

  const promptTemplate =
    range === "day" ? settings.prompts.day : settings.prompts.week;
  const prompt = buildPrompt(
    promptTemplate,
    formatRangeDate(from),
    formatRangeDate(to),
    notesText
  );

  if (settings.ai.provider !== "qwen") {
    return { ok: false, error: "unsupported_provider" };
  }

  const result = await callQwen({
    apiKey: settings.ai.apiKey,
    baseUrl: settings.ai.baseUrl,
    model: settings.ai.model,
    prompt
  });

  if (!result.ok) return result;

  const title =
    range === "day"
      ? `日报 ${fromDate.toLocaleDateString("zh-CN")}`
      : `周报 ${fromDate.toLocaleDateString("zh-CN")}~${toDate.toLocaleDateString("zh-CN")}`;
  const content = toHtml(result.text.trim());
  const stmt = db.prepare(
    "INSERT INTO notes (type, title, content, tags, status, created_at, updated_at) VALUES (@type, @title, @content, @tags, @status, @created_at, @updated_at)"
  );
  const info = stmt.run({
    type: "report",
    title,
    content,
    tags: range,
    status: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  });

  return { ok: true, id: info.lastInsertRowid, text: result.text };
}
function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "tray.png");
  tray = new Tray(iconPath);
  const menu = Menu.buildFromTemplate([
    { label: "打开主窗口", click: () => { ensureMainWindow(); mainWindow.show(); } },
    { label: "快速输入", click: () => { showQuickWindow(); } },
    { type: "separator" },
    { label: "退出", click: () => app.quit() }
  ]);
  tray.setToolTip("QuickLog");
  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    ensureMainWindow();
    mainWindow.show();
    mainWindow.focus();
  });
}

function setupIpc() {
  ipcMain.handle("note:add", (event, payload) => {
    const now = new Date().toISOString();
    const title = (payload.title || "").trim();
    const content = payload.content || "";
    const stmt = db.prepare(
      "INSERT INTO notes (type, title, content, tags, status, created_at, updated_at) VALUES (@type, @title, @content, @tags, @status, @created_at, @updated_at)"
    );
    const info = stmt.run({
      type: payload.type,
      title: title || null,
      content,
      tags: payload.tags || null,
      status: payload.status || null,
      created_at: now,
      updated_at: now
    });
    return { id: info.lastInsertRowid };
  });

  ipcMain.handle("note:list", (event, payload) => {
    const { type, query, limit = 50, offset = 0, from, to } = payload || {};
    const conditions = [];
    const params = {};

    if (type && type !== "all") {
      conditions.push("type = @type");
      params.type = type;
    }
    if (query) {
      conditions.push("content LIKE @query");
      params.query = `%${query}%`;
    }
    if (from) {
      conditions.push("created_at >= @from");
      params.from = from;
    }
    if (to) {
      conditions.push("created_at <= @to");
      params.to = to;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const stmt = db.prepare(
      `SELECT * FROM notes ${where} ORDER BY datetime(created_at) DESC LIMIT @limit OFFSET @offset`
    );
    return stmt.all({ ...params, limit, offset });
  });

  ipcMain.handle("note:stats", (event, payload) => {
    const range = payload?.range || "week";
    const now = new Date();
    const fromDate = new Date(now);
    if (range === "day") {
      fromDate.setDate(now.getDate() - 1);
    } else {
      fromDate.setDate(now.getDate() - 7);
    }
    const from = fromDate.toISOString();

    const total = db.prepare("SELECT COUNT(*) as count FROM notes WHERE created_at >= ?").get(from).count;
    const byType = db.prepare(
      "SELECT type, COUNT(*) as count FROM notes WHERE created_at >= ? GROUP BY type"
    ).all(from);
    const todoDone = db.prepare(
      "SELECT COUNT(*) as done FROM notes WHERE created_at >= ? AND type = 'todo' AND status = 'done'"
    ).get(from).done;
    const todoAll = db.prepare(
      "SELECT COUNT(*) as allCount FROM notes WHERE created_at >= ? AND type = 'todo'"
    ).get(from).allCount;

    return {
      range,
      from,
      total,
      byType,
      todo: {
        done: todoDone,
        total: todoAll
      }
    };
  });

  ipcMain.handle("note:delete", (event, payload) => {
    const stmt = db.prepare("DELETE FROM notes WHERE id = ?");
    const info = stmt.run(payload.id);
    return { deleted: info.changes > 0 };
  });

  ipcMain.handle("note:update", (event, payload) => {
    const now = new Date().toISOString();
    const nextType = typeof payload.type === "string" && payload.type.trim() ? payload.type.trim() : null;
    const current = db.prepare("SELECT created_at FROM notes WHERE id = ?").get(payload.id);
    const createdAtRaw = typeof payload.created_at === "string" ? payload.created_at : "";
    const createdAtDate = createdAtRaw ? new Date(createdAtRaw) : null;
    const nextCreatedAt =
      createdAtDate && !Number.isNaN(createdAtDate.getTime())
        ? createdAtDate.toISOString()
        : current?.created_at || now;
    const stmt = db.prepare("UPDATE notes SET type = ?, title = ?, content = ?, created_at = ?, updated_at = ? WHERE id = ?");
    const info = stmt.run(nextType, payload.title || null, payload.content || "", nextCreatedAt, now, payload.id);
    return { updated: info.changes > 0 };
  });

  ipcMain.handle("note:updateStatus", (event, payload) => {
    const now = new Date().toISOString();
    const stmt = db.prepare("UPDATE notes SET status = ?, updated_at = ? WHERE id = ?");
    const info = stmt.run(payload.status || null, now, payload.id);
    return { updated: info.changes > 0 };
  });

  ipcMain.handle("settings:getShortcut", () => {
    return { shortcut: settings.shortcut || "Alt+Q" };
  });

  ipcMain.handle("settings:setShortcut", (event, payload) => {
    const next = payload?.shortcut || "";
    return applyShortcut(next);
  });

  ipcMain.handle("settings:getAll", () => {
    return settings;
  });
  ipcMain.handle("settings:getDefaults", () => {
    return defaultSettings;
  });

  ipcMain.handle("settings:update", (event, payload) => {
    if (!payload || typeof payload !== "object") return { ok: false };
    settings = {
      ...settings,
      ...payload,
      ai: { ...settings.ai, ...(payload.ai || {}) },
      prompts: { ...settings.prompts, ...(payload.prompts || {}) }
    };
    if (!settings.ai.baseUrl) settings.ai.baseUrl = defaultSettings.ai.baseUrl;
    if (!settings.ai.model) settings.ai.model = defaultSettings.ai.model;
    if (!settings.prompts.day) settings.prompts.day = defaultSettings.prompts.day;
    if (!settings.prompts.week) settings.prompts.week = defaultSettings.prompts.week;
    saveSettings();
    if (payload.shortcut) {
      applyShortcut(payload.shortcut);
    }
    return { ok: true, settings };
  });

  ipcMain.handle("report:generate", async (event, payload) => {
    const range = payload?.range === "day" ? "day" : "week";
    const from = payload?.from || null;
    const to = payload?.to || null;
    return await generateReport(range, from, to);
  });

  ipcMain.handle("quick:hide", () => {
    if (quickWindow && quickWindow.isVisible()) quickWindow.hide();
    return true;
  });
}

app.whenReady().then(() => {
  initLogging();
  loadSettings();
  ensureDb();
  createMainWindow();
  createQuickWindow();
  createTray();
  registerShortcuts();
  setupIpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});






