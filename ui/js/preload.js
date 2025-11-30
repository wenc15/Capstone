/* 11.27 created by Jingyao Sun:
    前后端之间的bridge,允许我们在前端 JavaScript中安全地调用 Electron 提供的原生功能*/

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('ball:setIgnore', ignore),
  emitFocusStatus: (st) => ipcRenderer.send('focus:status', st),
  onFocusStatus: (cb) => ipcRenderer.on('focus:status', (_e, st) => cb(st)),
});
