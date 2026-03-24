/* 11.27 created by Jingyao Sun:
    前后端之间的bridge,允许我们在前端 JavaScript中安全地调用 Electron 提供的原生功能
    
   12.21 added by Jingyao:
   新增command 转发，让悬浮球从被动监听变成主动发控制命令
*/

// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('ball:setIgnore', ignore),

  // app behavior settings
  getAppSettings: () => ipcRenderer.invoke('appSettings:get'),
  updateAppSettings: (patch) => ipcRenderer.invoke('appSettings:update', patch),
  setWidgetVisible: (visible) => ipcRenderer.invoke('widget:setVisible', !!visible),
  onAppSettingsChanged: (cb) => ipcRenderer.on('appSettings:changed', (_e, settings) => cb(settings)),
  maximizeMainWindowForMinigame: async () => {
    try {
      return await ipcRenderer.invoke('main:maximizeForDicebuild');
    } catch {
      return false;
    }
  },

  // status: already have
  emitFocusStatus: (st) => ipcRenderer.send('focus:status', st),
  onFocusStatus: (cb) => ipcRenderer.on('focus:status', (_e, st) => cb(st)),

  // command:
  sendFocusCommand: (cmd) => ipcRenderer.send('focus:command', cmd), // 'start' | 'stop' | 'toggle'
  onFocusCommand: (cb) => ipcRenderer.on('focus:command', (_e, cmd) => cb(cmd)),
});
