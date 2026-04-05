// 2026/04/05 edited by zhechengxu
// Changes:
//  - Add whitelist picker IPC with exe/lnk support and shortcut target resolution.

// Capstone/ui/main.js
// 2025/11/28 edited by Jingyao: 新增 ballwin 使悬浮球为独立窗口

// 2026/03/25 edited by Zhecheng Xu
// Changes:
//  - Add music track listing IPC and music command forwarding.
//  - Extend app settings payload to include uiTone and broadcast to widget.

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

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, session, shell, dialog } = require('electron');

const { placeBallAtOldWidgetSpot } = require('./js/ballPositioner');

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
let parseAudioMetadata = null;
try {
  ({ parseFile: parseAudioMetadata } = require('music-metadata'));
} catch {
  parseAudioMetadata = null;
}
const PRELOAD_PATH = path.join(__dirname, 'js', 'preload.js');
const iconPath = path.join(__dirname, 'assets', 'tray.png');
// ✅ 新增：tray 相关变量
let tray = null;
let isQuitting = false;

let mainWin, ballWin;
let hasAppliedInitialWidgetVisibility = false;
let isBallReadyToShow = false;
let pendingWidgetVisibility = null;
let widgetShowAnimTimer = null;
const APP_SETTINGS_FILE = 'growin-ui-settings.json';
const DEFAULT_APP_SETTINGS = Object.freeze({
  showWidget: true,
  closeBehavior: 'minimize', // 'minimize' | 'exit'
  uiTone: 'default', // 'default' | 'sky'
});
let appSettings = { ...DEFAULT_APP_SETTINGS };

const MUSIC_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

function getMusicFolder() {
  return path.join(__dirname, 'music');
}

function walkMusicFiles(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMusicFiles(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!MUSIC_EXTS.has(ext)) continue;
    out.push(abs);
  }
  return out;
}

async function readTrackTag(absPath) {
  if (!parseAudioMetadata) return null;
  try {
    const m = await parseAudioMetadata(absPath, { duration: false, skipCovers: true });
    const c = m?.common || {};
    const title = typeof c.title === 'string' ? c.title.trim() : '';
    const album = typeof c.album === 'string' ? c.album.trim() : '';
    const artist = typeof c.artist === 'string' ? c.artist.trim() : '';
    return {
      title: title || null,
      album: album || null,
      artist: artist || null,
    };
  } catch {
    return null;
  }
}

async function listMusicTracksPayload() {
  const folder = getMusicFolder();
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const files = walkMusicFiles(folder).sort((a, b) => a.localeCompare(b));
  const tracks = await Promise.all(files.map(async (abs) => {
    const tag = await readTrackTag(abs);
    const file = path.basename(abs);
    const fallbackAlbum = path.basename(path.dirname(abs)) || 'music';
    return {
      src: pathToFileURL(abs).toString(),
      file,
      title: tag?.title || file.replace(/\.[a-zA-Z0-9]+$/, ''),
      album: tag?.album || fallbackAlbum,
      artist: tag?.artist || '',
      absolutePath: abs,
    };
  }));

  return { folder, tracks };
}

function normalizeAppSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const showWidgetRaw =
    typeof src.showWidget === 'boolean'
      ? src.showWidget
      : src.widgetVisibleOnStartup;

  return {
    showWidget: showWidgetRaw !== false,
    closeBehavior: src.closeBehavior === 'exit' ? 'exit' : 'minimize',
    uiTone: String(src.uiTone || '').toLowerCase() === 'sky' ? 'sky' : 'default',
  };
}

function currentSettingsPayload() {
  return { ...appSettings };
}

function broadcastAppSettingsChanged() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('appSettings:changed', currentSettingsPayload());
  }
  if (ballWin && !ballWin.isDestroyed()) {
    ballWin.webContents.send('appSettings:changed', currentSettingsPayload());
  }
}

function setWidgetVisible(visible, { focus = false, save = false, notify = false } = {}) {
  const v = !!visible;

  appSettings.showWidget = v;

  if (ballWin && !ballWin.isDestroyed()) {
    if (!isBallReadyToShow) {
      pendingWidgetVisibility = v;
    } else if (v) {
      if (!ballWin.isVisible()) {
        if (widgetShowAnimTimer) {
          clearInterval(widgetShowAnimTimer);
          widgetShowAnimTimer = null;
        }
        try { ballWin.setOpacity(0); } catch {}
        ballWin.showInactive();
        const durationMs = 110;
        const stepMs = 16;
        const startFade = () => {
          const startTs = Date.now();
          widgetShowAnimTimer = setInterval(() => {
            if (!ballWin || ballWin.isDestroyed()) {
              clearInterval(widgetShowAnimTimer);
              widgetShowAnimTimer = null;
              return;
            }
            const t = Math.min(1, (Date.now() - startTs) / durationMs);
            try { ballWin.setOpacity(t); } catch {}
            if (t >= 1) {
              clearInterval(widgetShowAnimTimer);
              widgetShowAnimTimer = null;
            }
          }, stepMs);
        };
        setTimeout(startFade, 0);
      }
      if (focus) ballWin.focus();
    } else if (ballWin.isVisible()) {
      if (widgetShowAnimTimer) {
        clearInterval(widgetShowAnimTimer);
        widgetShowAnimTimer = null;
      }
      try { ballWin.setOpacity(0); } catch {}
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
    height: 960,
    minHeight: 900,
    icon: iconPath,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin.loadFile('index.html'); // 你的原主界面（计时逻辑照旧）
  mainWin.once('ready-to-show', () => {
    try {
      const [w, h] = mainWin.getSize();
      if (h < 900) {
        mainWin.setSize(Math.max(w, 1100), 960);
      }
    } catch {
      // ignore
    }
  });
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
  // Keep widget window close to the visual circle bounds
  // (#widget is 140px + 2px border on each side => ~144px).
  const winSize = 144;

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
  try { ballWin.setOpacity(0); } catch {}

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

ipcMain.handle('music:openFolder', async () => {
  try {
    const folder = getMusicFolder();
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const err = await shell.openPath(folder);
    return { ok: !err, folder, error: err || null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('music:listTracks', async () => {
  try {
    const { folder, tracks } = await listMusicTracksPayload();
    return { ok: true, folder, tracks };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), tracks: [] };
  }
});

function extractFirstExeToken(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) return '';

  const quoted = text.match(/"([^"\r\n]*?\.exe)"/i);
  if (quoted?.[1]) {
    const fromQuoted = path.basename(quoted[1]);
    if (/\.exe$/i.test(fromQuoted)) return fromQuoted;
  }

  const plain = text.match(/([^\s"'`<>|]+?\.exe)/i);
  if (plain?.[1]) {
    const fromPlain = path.basename(plain[1]);
    if (/\.exe$/i.test(fromPlain)) return fromPlain;
  }

  return '';
}

function getWhitelistBrowseDefaultPath() {
  let userDesktop = '';
  try {
    userDesktop = app.getPath('desktop');
  } catch {
    userDesktop = '';
  }

  const publicDesktop = path.join('C:\\Users', 'Public', 'Desktop');
  const hasUserDesktop = !!userDesktop && fs.existsSync(userDesktop);
  const hasPublicDesktop = fs.existsSync(publicDesktop);

  if (hasUserDesktop && hasPublicDesktop) {
    const userChrome = fs.existsSync(path.join(userDesktop, 'Google Chrome.lnk'));
    const publicChrome = fs.existsSync(path.join(publicDesktop, 'Google Chrome.lnk'));
    if (!userChrome && publicChrome) {
      return publicDesktop;
    }
    return userDesktop;
  }

  if (hasUserDesktop) return userDesktop;
  if (hasPublicDesktop) return publicDesktop;
  return undefined;
}

ipcMain.handle('whitelist:pickAppFile', async () => {
  try {
    const owner = mainWin && !mainWin.isDestroyed() ? mainWin : null;
    const pick = await dialog.showOpenDialog(owner, {
      title: 'Select application or shortcut',
      defaultPath: getWhitelistBrowseDefaultPath(),
      properties: ['openFile'],
      filters: [
        { name: 'Applications and shortcuts', extensions: ['exe', 'lnk'] },
        { name: 'Applications', extensions: ['exe'] },
        { name: 'Shortcuts', extensions: ['lnk'] },
      ],
    });

    if (pick.canceled || !Array.isArray(pick.filePaths) || pick.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedPath = String(pick.filePaths[0] || '');
    const selectedName = path.basename(selectedPath);
    const ext = path.extname(selectedPath).toLowerCase();

    let targetPath = '';
    if (ext === '.lnk') {
      try {
        const shortcut = shell.readShortcutLink(selectedPath);
        targetPath = String(shortcut?.target || '');
      } catch {
        targetPath = '';
      }
    }

    const resolvedPath = targetPath || selectedPath;
    const resolvedExeName = extractFirstExeToken(resolvedPath || selectedName);

    return {
      canceled: false,
      selectedPath,
      selectedName,
      selectedExt: ext,
      targetPath: targetPath || null,
      resolvedExeName: resolvedExeName || null,
    };
  } catch (e) {
    return {
      canceled: false,
      error: e?.message || String(e),
    };
  }
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

// widget music quick controls -> main window player
ipcMain.on('music:command', (_evt, cmd) => {
  if (mainWin) mainWin.webContents.send('music:command', cmd);
});
