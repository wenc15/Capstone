// Capstone/ui/main.js
// 2025/11/28 edited by Jingyao: 新增 ballwin 使悬浮球为独立窗口

//12.20 edited by Jingyao: 用变量统一管理文件路径
// 2026/01/29 edited by Zhecheng Xu
// 新增内容：
//   - 新增托盘图标 Tray：支持单击/右键弹出菜单、双击打开主界面。
//   - Tray 菜单项调整：Show/Hide Main Window、Show/Hide Widget、Quit（英文显示）。
//   - Window close 行为调整：主窗口与 widget 窗口 close 事件改为 hide（避免关闭后对象销毁导致报错）。
//   - 增加 Windows 图标配置：BrowserWindow icon（用于左上角与任务栏图标），并补齐 nativeImage 引用。
// =============================================================
// 作用补充：
//   - 允许应用“常驻后台”：点击关闭不会退出，可通过托盘再次打开。
//   - Widget 支持从托盘随时显示/隐藏，避免 close 后无法恢复的问题。
// =============================================================

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, session } = require('electron');

const { placeBallAtOldWidgetSpot } = require('./js/ballPositioner');

const fs = require('fs');
const path = require('path');
const PRELOAD_PATH = path.join(__dirname, 'js', 'preload.js');
const iconPath = path.join(__dirname, 'assets', 'tray.png');
// ✅ 新增：tray 相关变量
let tray = null;
let isQuitting = false;

let mainWin, ballWin;
let hasAppliedInitialWidgetVisibility = false;
let isBallReadyToShow = false;
let pendingWidgetVisibility = null;
const APP_SETTINGS_FILE = 'growin-ui-settings.json';
const DEFAULT_APP_SETTINGS = Object.freeze({
  showWidget: true,
  closeBehavior: 'minimize', // 'minimize' | 'exit'
});
let appSettings = { ...DEFAULT_APP_SETTINGS };

function normalizeAppSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const showWidgetRaw =
    typeof src.showWidget === 'boolean'
      ? src.showWidget
      : src.widgetVisibleOnStartup;

  return {
    showWidget: showWidgetRaw !== false,
    closeBehavior: src.closeBehavior === 'exit' ? 'exit' : 'minimize',
  };
}

function currentSettingsPayload() {
  return { ...appSettings };
}

function broadcastAppSettingsChanged() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('appSettings:changed', currentSettingsPayload());
  }
}

function setWidgetVisible(visible, { focus = false, save = false, notify = false } = {}) {
  const v = !!visible;

  appSettings.showWidget = v;

  if (ballWin && !ballWin.isDestroyed()) {
    if (!isBallReadyToShow) {
      pendingWidgetVisibility = v;
    } else if (v) {
      if (!ballWin.isVisible()) ballWin.show();
      if (focus) ballWin.focus();
    } else if (ballWin.isVisible()) {
      ballWin.hide();
    }
  }

  if (save) saveAppSettings();
  if (notify) broadcastAppSettingsChanged();
  refreshTrayMenu();
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), APP_SETTINGS_FILE);
}

function loadAppSettings() {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) {
      appSettings = { ...DEFAULT_APP_SETTINGS };
      return;
    }
    const raw = fs.readFileSync(p, 'utf8');
    appSettings = normalizeAppSettings(JSON.parse(raw));
  } catch (err) {
    console.warn('[Settings] Failed to load app settings:', err);
    appSettings = { ...DEFAULT_APP_SETTINGS };
  }
}

function saveAppSettings() {
  try {
    const p = getSettingsPath();
    fs.writeFileSync(p, JSON.stringify(appSettings, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Settings] Failed to save app settings:', err);
  }
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: iconPath,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin.loadFile('index.html'); // 你的原主界面（计时逻辑照旧）
    // ✅ 关键：拦截关闭按钮 -> 不退出，改为隐藏到托盘
  mainWin.on('close', (e) => {
    if (isQuitting) return; // 真退出时放行

    if (appSettings.closeBehavior === 'exit') {
      e.preventDefault();
      isQuitting = true;
      app.quit();
      return;
    }

    e.preventDefault();
    mainWin.hide();
  });
  mainWin.on('show', refreshTrayMenu);
  mainWin.on('hide', refreshTrayMenu);

}

function createBall() {
  hasAppliedInitialWidgetVisibility = false;
  isBallReadyToShow = false;
  pendingWidgetVisibility = null;

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

  ballWin.once('ready-to-show', () => {
    // ✅ 先摆位置；初始可见性统一在 main did-finish-load 时应用，避免闪现
    try { placeBallAtOldWidgetSpot(mainWin, ballWin); } catch {}
    isBallReadyToShow = true;

    if (pendingWidgetVisibility !== null) {
      setWidgetVisible(pendingWidgetVisibility, { save: false, notify: false });
      pendingWidgetVisibility = null;
    }

    refreshTrayMenu();
  });
  ballWin.on('show', () => {
    if (appSettings.showWidget !== true) {
      appSettings.showWidget = true;
      saveAppSettings();
      broadcastAppSettingsChanged();
    }
    refreshTrayMenu();
  });
  ballWin.on('hide', () => {
    if (appSettings.showWidget !== false) {
      appSettings.showWidget = false;
      saveAppSettings();
      broadcastAppSettingsChanged();
    }
    refreshTrayMenu();
  });
  ballWin.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    setWidgetVisible(false, { save: true, notify: true });
  });
}

// ✅ 新增：创建托盘图标（Tray）
function buildTrayMenu() {
  const items = [];

  const mainVisible = !!mainWin && mainWin.isVisible();
  const ballVisible = !!ballWin && ballWin.isVisible();

  // Main window
  if (mainWin && !mainVisible) {
    items.push({
      label: 'Show Main Window',
      click: () => {
        mainWin.show();
        mainWin.focus();
      }
    });
  }
  if (mainWin && mainVisible) {
    items.push({
      label: 'Hide Main Window',
      click: () => {
        mainWin.hide();
      }
    });
  }

  // Widget window
  if (ballWin && !ballVisible) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Show Widget',
      click: () => {
        setWidgetVisible(true, { focus: true, save: true, notify: true });
      }
    });
  }
  if (ballWin && ballVisible) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Hide Widget',
      click: () => {
        setWidgetVisible(false, { save: true, notify: true });
      }
    });
  }

  // Always keep Quit
  items.push({ type: 'separator' });
  items.push({
    label: 'Quit',
    click: () => {
      isQuitting = true;
      app.quit();
    }
  });

  return Menu.buildFromTemplate(items);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const image = nativeImage.createFromPath(iconPath);

  tray = new Tray(image);
  tray.setToolTip('Growin');

  // ✅ 初次设置
  refreshTrayMenu();

  // 单击延迟：用来区分单击 vs 双击（避免双击时也触发单击弹菜单）
  let clickTimer = null;
  const CLICK_DELAY_MS = 350;

  function showTrayMenu() {
    refreshTrayMenu();
    tray.popUpContextMenu();
  }

  tray.on('right-click', () => {
    // 右键：直接弹出菜单
    showTrayMenu();
  });

  tray.on('click', () => {
    // 单击：表现和右键一样（弹出菜单）
    // 但要延迟一点，避免双击时先弹菜单
    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      clickTimer = null;
      showTrayMenu();
    }, CLICK_DELAY_MS);
  });

  tray.on('double-click', () => {
    // 双击：打开主界面（show + focus）
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }

    if (!mainWin) return;
    mainWin.show();
    mainWin.focus();

    refreshTrayMenu();
  });
}



app.whenReady().then(() => {
  // Allow geolocation for renderer (used by weather module).
  // Electron does not show Chromium permission prompts by default,
  // so we handle the permission request here.
  const ses = session?.defaultSession;
  if (ses) {
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'geolocation') {
        callback(true);
        return;
      }
      callback(false);
    });
  }

  loadAppSettings();
  createMain();
  createBall();
  createTray(); // ✅ 加这一行

  mainWin.webContents.once('did-finish-load', () => {
    try { placeBallAtOldWidgetSpot(mainWin, ballWin); } catch {}
    if (!hasAppliedInitialWidgetVisibility) {
      hasAppliedInitialWidgetVisibility = true;
      setWidgetVisible(appSettings.showWidget, { save: false, notify: false });
    }
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

ipcMain.handle('appSettings:get', () => currentSettingsPayload());

ipcMain.handle('widget:setVisible', (_evt, visible) => {
  setWidgetVisible(!!visible, { save: true, notify: true });
  return currentSettingsPayload();
});

ipcMain.handle('main:maximizeForDicebuild', () => {
  if (!mainWin || mainWin.isDestroyed()) return false;
  if (!mainWin.isVisible()) mainWin.show();
  mainWin.focus();
  if (!mainWin.isMaximized()) {
    mainWin.maximize();
  }
  return true;
});

ipcMain.handle('appSettings:update', (_evt, patch) => {
  const nextPatch = { ...(patch || {}) };
  if (typeof nextPatch.showWidget !== 'boolean' && typeof nextPatch.widgetVisibleOnStartup === 'boolean') {
    nextPatch.showWidget = nextPatch.widgetVisibleOnStartup;
  }

  const prevShowWidget = appSettings.showWidget;
  appSettings = normalizeAppSettings({ ...appSettings, ...nextPatch });

  if (appSettings.showWidget !== prevShowWidget) {
    setWidgetVisible(appSettings.showWidget, { save: false, notify: false });
  }

  saveAppSettings();
  broadcastAppSettingsChanged();

  return currentSettingsPayload();
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
