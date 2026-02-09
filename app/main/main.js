const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

let mainWindow;
let quickWindow;
let tray;
let db;
let settings = { shortcut: "Alt+Q" };

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
    if (data && typeof data.shortcut === "string" && data.shortcut.trim()) {
      settings.shortcut = data.shortcut.trim();
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
      content TEXT NOT NULL,
      tags TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
  `);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    title: "QuickLog",
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
    height: 220,
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
    const stmt = db.prepare(
      "INSERT INTO notes (type, content, tags, status, created_at, updated_at) VALUES (@type, @content, @tags, @status, @created_at, @updated_at)"
    );
    const info = stmt.run({
      type: payload.type,
      content: payload.content,
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






