const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  addNote: (payload) => ipcRenderer.invoke("note:add", payload),
  listNotes: (payload) => ipcRenderer.invoke("note:list", payload),
  getStats: (payload) => ipcRenderer.invoke("note:stats", payload),
  deleteNote: (payload) => ipcRenderer.invoke("note:delete", payload),
  updateNote: (payload) => ipcRenderer.invoke("note:update", payload),
  updateStatus: (payload) => ipcRenderer.invoke("note:updateStatus", payload),
  getShortcut: () => ipcRenderer.invoke("settings:getShortcut"),
  setShortcut: (payload) => ipcRenderer.invoke("settings:setShortcut", payload),
  getSettings: () => ipcRenderer.invoke("settings:getAll"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  generateReport: (payload) => ipcRenderer.invoke("report:generate", payload),
  hideQuick: () => ipcRenderer.invoke("quick:hide"),
  onQuickFocus: (handler) => ipcRenderer.on("quick:focus", handler),
  onMainRefresh: (handler) => ipcRenderer.on("main:refresh", handler)
});
