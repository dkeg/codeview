const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron')
const fs = require('fs')
const path = require('path')
const pty = require('node-pty')
const { exec } = require('child_process')

let mainWindow = null
let pendingOpenFile = null

// Terminal management
const terminals = new Map()
let nextTerminalId = 1

// Handle file open from Finder before window is ready
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-external-file', filePath)
  } else {
    pendingOpenFile = filePath
  }
})

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf8')
    return JSON.parse(data)
  } catch {
    return {
      theme: 'system',
      fontFamily: 'SF Mono',
      fontSize: 14,
      lineNumbers: true,
      restoreSession: true,
      syncScroll: true
    }
  }
}

function saveSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

function getSessionPath() {
  return path.join(app.getPath('userData'), 'session.json')
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.md': 'markdown', '.markdown': 'markdown',
    '.json': 'json',
    '.html': 'html', '.htm': 'html',
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'javascript', '.tsx': 'javascript',
    '.py': 'python',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.txt': 'text'
  }
  return map[ext] || 'text'
}

function killAllTerminals() {
  for (const [id, ptyProcess] of terminals) {
    try {
      ptyProcess.kill()
    } catch (_) {}
    terminals.delete(id)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 620,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#00000000',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.loadFile('index.html')

  mainWindow.webContents.on('did-finish-load', () => {
    const isDark = nativeTheme.shouldUseDarkColors
    mainWindow.webContents.send('theme-updated', isDark ? 'dark' : 'light')
    if (pendingOpenFile) {
      mainWindow.webContents.send('open-external-file', pendingOpenFile)
      pendingOpenFile = null
    }
  })

  nativeTheme.on('updated', () => {
    if (mainWindow) {
      const isDark = nativeTheme.shouldUseDarkColors
      mainWindow.webContents.send('theme-updated', isDark ? 'dark' : 'light')
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function buildMenu() {
  const template = [
    {
      label: 'CodeView',
      submenu: [
        { label: 'About CodeView', role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'Cmd+,',
          click: () => mainWindow && mainWindow.webContents.send('open-settings')
        },
        { type: 'separator' },
        { label: 'Services', role: 'services' },
        { type: 'separator' },
        { label: 'Hide CodeView', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit CodeView', role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'Cmd+N',
          click: () => mainWindow && mainWindow.webContents.send('menu-new-file')
        },
        { type: 'separator' },
        {
          label: 'Open…',
          accelerator: 'Cmd+O',
          click: () => mainWindow && mainWindow.webContents.send('menu-open-file')
        },
        {
          label: 'Open Folder…',
          accelerator: 'Cmd+Shift+O',
          click: () => mainWindow && mainWindow.webContents.send('menu-open-folder')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'Cmd+S',
          click: () => mainWindow && mainWindow.webContents.send('menu-save')
        },
        {
          label: 'Save As…',
          accelerator: 'Cmd+Shift+S',
          click: () => mainWindow && mainWindow.webContents.send('menu-save-as')
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'Cmd+W',
          click: () => mainWindow && mainWindow.webContents.send('menu-close-tab')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Editor Only',
          accelerator: 'Cmd+1',
          click: () => mainWindow && mainWindow.webContents.send('menu-view-mode', 'editor')
        },
        {
          label: 'Split View',
          accelerator: 'Cmd+2',
          click: () => mainWindow && mainWindow.webContents.send('menu-view-mode', 'split')
        },
        {
          label: 'Preview Only',
          accelerator: 'Cmd+3',
          click: () => mainWindow && mainWindow.webContents.send('menu-view-mode', 'preview')
        },
        { type: 'separator' },
        {
          label: 'Cycle View Mode',
          accelerator: 'Cmd+Shift+P',
          click: () => mainWindow && mainWindow.webContents.send('menu-cycle-view')
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'Cmd+B',
          click: () => mainWindow && mainWindow.webContents.send('menu-toggle-sidebar')
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'Cmd+`',
          click: () => mainWindow && mainWindow.webContents.send('menu-toggle-terminal')
        },
        { type: 'separator' },
        { label: 'Reload', role: 'reload' },
        { label: 'Toggle Developer Tools', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { type: 'separator' },
        { label: 'Bring All to Front', role: 'front' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// IPC: Terminal management
ipcMain.handle('terminal-create', async (event, cwd) => {
  const id = nextTerminalId++
  const shell = process.env.SHELL || '/bin/zsh'

  const ptyProcess = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || app.getPath('home'),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8' }
  })

  ptyProcess.onData(data => {
    if (mainWindow) mainWindow.webContents.send('terminal-output', id, data)
  })

  ptyProcess.onExit(() => {
    terminals.delete(id)
    if (mainWindow) mainWindow.webContents.send('terminal-exit', id)
  })

  terminals.set(id, ptyProcess)
  return id
})

ipcMain.on('terminal-input', (event, id, data) => {
  const ptyProcess = terminals.get(id)
  if (ptyProcess) ptyProcess.write(data)
})

ipcMain.on('terminal-resize', (event, id, cols, rows) => {
  const ptyProcess = terminals.get(id)
  if (ptyProcess) ptyProcess.resize(cols, rows)
})

ipcMain.handle('terminal-kill', async (event, id) => {
  const ptyProcess = terminals.get(id)
  if (ptyProcess) {
    try {
      ptyProcess.kill()
    } catch (_) {}
    terminals.delete(id)
  }
  return { success: true }
})

// IPC: File operations
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const type = getFileType(filePath)
    return { success: true, content, type, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('show-open-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Code & Text Files', extensions: ['md', 'markdown', 'json', 'html', 'htm', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'yaml', 'yml', 'sh', 'bash', 'zsh', 'txt'] },
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'JavaScript / TypeScript', extensions: ['js', 'mjs', 'cjs', 'ts', 'tsx'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'YAML', extensions: ['yaml', 'yml'] },
      { name: 'Shell Scripts', extensions: ['sh', 'bash', 'zsh'] },
      { name: 'Plain Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('show-folder-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('show-save-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'JavaScript / TypeScript', extensions: ['js', 'mjs', 'cjs', 'ts', 'tsx'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'YAML', extensions: ['yaml', 'yml'] },
      { name: 'Shell Scripts', extensions: ['sh', 'bash', 'zsh'] },
      { name: 'Plain Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled) return null
  return result.filePath
})

ipcMain.handle('read-dir', async (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name)
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (err) {
    return []
  }
})

ipcMain.handle('get-settings', async () => loadSettings())
ipcMain.handle('set-settings', async (event, settings) => {
  saveSettings(settings)
  return { success: true }
})

ipcMain.handle('get-session', async () => {
  try {
    const data = fs.readFileSync(getSessionPath(), 'utf8')
    const session = JSON.parse(data)
    // Migrate legacy single folderPath to openFolders array
    if (session && session.folderPath && !session.openFolders) {
      session.openFolders = [session.folderPath]
      delete session.folderPath
    }
    if (session && !session.openFolders) {
      session.openFolders = []
    }
    return session
  } catch {
    return null
  }
})

ipcMain.handle('save-session', async (event, session) => {
  try {
    // Ensure openFolders is always present
    const normalized = { openFolders: [], ...session }
    fs.writeFileSync(getSessionPath(), JSON.stringify(normalized, null, 2), 'utf8')
    return { success: true }
  } catch {
    return { success: false }
  }
})

ipcMain.handle('get-theme', async () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
})

ipcMain.handle('show-item-in-finder', async (event, filePath) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('set-title', async (event, title) => {
  if (mainWindow) mainWindow.setTitle(title)
})

ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url)
})

ipcMain.handle('get-home-dir', async () => app.getPath('home'))

ipcMain.handle('get-git-status', async (event, dirPath) => {
  return new Promise((resolve) => {
    // -u tells git to show untracked files as well
    exec('git status --porcelain -u', { cwd: dirPath }, (err, stdout) => {
      if (err) {
        resolve({ success: false, error: err.message })
        return
      }

      const statusMap = {}
      const lines = stdout.split('\n')
      
      lines.forEach(line => {
        if (!line.trim()) return
        const code = line.substring(0, 2).trim()
        const file = line.substring(3).trim()
        // Handle renamed files (old -> new)
        const fileName = file.includes(' -> ') ? file.split(' -> ')[1] : file
        statusMap[fileName] = code
      })

      resolve({ success: true, status: statusMap })
    })
  })
})

ipcMain.handle('get-git-branch', async (event, dirPath) => {
  return new Promise((resolve) => {
    exec('git branch --show-current', { cwd: dirPath }, (err, stdout) => {
      if (err) {
        resolve({ success: false, error: err.message })
        return
      }
      resolve({ success: true, branch: stdout.trim() })
    })
  })
})

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAllTerminals()
})
