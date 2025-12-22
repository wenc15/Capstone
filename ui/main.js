// Capstone/ui/main.js
// 2025/11/28 edited by Jingyao: 新增 ballwin 使悬浮球为独立窗口

//12.20 edited by Jingyao: 用变量统一管理文件路径
// =============================================================

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { placeBallAtOldWidgetSpot } = require('./js/ballPositioner');

const path = require('path');

const PRELOAD_PATH = path.join(__dirname, 'js', 'preload.js');


let mainWin, ballWin;

function createMain() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: PRELOAD_PATH,
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
    show: false,
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
      preload: PRELOAD_PATH,
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

  mainWin.webContents.once('did-finish-load', () => {
  placeBallAtOldWidgetSpot(mainWin, ballWin);
  ballWin.show();
});


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

// 新增：widget 发命令 -> 转给主窗口执行
ipcMain.on('focus:command', (_evt, cmd) => {
  if (mainWin) mainWin.webContents.send('focus:command', cmd);
});