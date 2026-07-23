const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    alwaysOnTop: true, // Always on top as requested
    resizable: true,
    show: false, // Start hidden (invisible) by default
    skipTaskbar: true, // Hide from the taskbar
    transparent: true, // Make background transparent
    frame: false, // Remove window frame
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity in this example to allow IPC from React
      devTools: false // Disabled Developer Tools to prevent hacking
    }
  });

  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Prevent window from being captured in screen shares, screenshots, or recordings
  mainWindow.setContentProtection(true);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent opening Developer Tools via shortcuts to avoid hacking
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
    }
    if (input.key === 'F12') {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register Global Hotkeys
  globalShortcut.register('F1', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-triggered', 'F1');
    }
  });

  globalShortcut.register('F2', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  globalShortcut.register('F3', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-triggered', 'F3');
    }
  });

  globalShortcut.register('F4', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut-triggered', 'F4');
    }
  });

  // Handle IPC request for full screen capture
  ipcMain.handle('capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
      const primaryDisplay = sources[0]; // Usually the first one is the primary screen
      if (primaryDisplay) {
        return primaryDisplay.thumbnail.toDataURL();
      }
      return null;
    } catch (error) {
      console.error('Error capturing screen:', error);
      return null;
    }
  });

  // Handle IPC request for region capture
  let captureWindow = null;
  let capturePromiseResolve = null;

  ipcMain.handle('start-region-capture', async () => {
    return new Promise((resolve) => {
      capturePromiseResolve = resolve;
      
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.bounds;

      captureWindow = new BrowserWindow({
        width, height,
        x: 0, y: 0,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          devTools: false
        }
      });

      captureWindow.setFullScreen(true);
      captureWindow.loadFile(path.join(__dirname, 'capture.html'));
      
      captureWindow.on('closed', () => {
        if (capturePromiseResolve) {
          capturePromiseResolve(null);
          capturePromiseResolve = null;
        }
        captureWindow = null;
      });
    });
  });

  ipcMain.on('region-selected', async (event, bounds) => {
    if (captureWindow) {
      captureWindow.close();
    }
    
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
      const primaryDisplay = sources[0];
      
      if (primaryDisplay && bounds) {
        const image = primaryDisplay.thumbnail;
        const cropped = image.crop(bounds);
        if (capturePromiseResolve) {
          capturePromiseResolve(cropped.toDataURL());
        }
      } else {
        if (capturePromiseResolve) capturePromiseResolve(null);
      }
    } catch (err) {
      console.error(err);
      if (capturePromiseResolve) capturePromiseResolve(null);
    } finally {
      capturePromiseResolve = null;
    }
  });

  ipcMain.on('set-opacity', (event, opacity) => {
    if (mainWindow) mainWindow.setOpacity(opacity);
  });

  ipcMain.on('toggle-always-on-top', (event, isAlwaysOnTop) => {
    if (mainWindow) mainWindow.setAlwaysOnTop(isAlwaysOnTop);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts when the application quits
  globalShortcut.unregisterAll();
});
