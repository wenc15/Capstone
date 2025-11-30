// Capstone/ui/main.js
// 2025/11/28 edited by Jingyao: 新增 ballwin 使悬浮球为独立窗口
// =============================================================

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWin, ballWin;

function createMain() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin.loadFile('index.html'); // 你的原主界面（计时逻辑照旧）
}

function createBall() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winSize = 160;

  ballWin = new BrowserWindow({
    width: winSize,
    height: winSize,
    x: width - winSize - 20,
    y: Math.floor(height * 0.65),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 更“凶”的置顶等级
  ballWin.setAlwaysOnTop(true, 'screen-saver');

  ballWin.loadFile('widget.html');
}

app.whenReady().then(() => {
  createMain();
  createBall();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMain();
      createBall();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// （可选）穿透点击
ipcMain.handle('ball:setIgnore', (_evt, ignore) => {
  if (ballWin) ballWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

// （可选）IPC 同步状态：作为 BroadcastChannel 的兜底
ipcMain.on('focus:status', (_evt, st) => {
  if (mainWin) mainWin.webContents.send('focus:status', st);
  if (ballWin) ballWin.webContents.send('focus:status', st);
});
