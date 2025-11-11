// Capstone/ui/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  const htmlPath = path.join(__dirname, 'index.html');
  console.log('Loading:', htmlPath, fs.existsSync(htmlPath));
  win.loadURL(pathToFileURL(htmlPath).toString());

  //win.webContents.openDevTools({ mode: 'detach' });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('did-fail-load:', code, desc);
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
