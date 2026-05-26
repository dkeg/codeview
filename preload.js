const { contextBridge, ipcRenderer } = require('electron')
const { marked } = require('marked')

marked.setOptions({
  gfm: true,
  breaks: false
})

contextBridge.exposeInMainWorld('api', {
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
  readDir: (dirPath) => ipcRenderer.invoke('read-dir', dirPath),

  // Settings & session
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  getSession: () => ipcRenderer.invoke('get-session'),
  saveSession: (session) => ipcRenderer.invoke('save-session', session),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),

  // Git
  getGitStatus: (dirPath) => ipcRenderer.invoke('get-git-status', dirPath),
  getGitBranch: (dirPath) => ipcRenderer.invoke('get-git-branch', dirPath),

  // Utility
  showInFinder: (filePath) => ipcRenderer.invoke('show-item-in-finder', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Markdown rendering
  renderMarkdown: (content) => {
    try {
      return marked.parse(content || '')
    } catch (e) {
      console.error('Markdown rendering error:', e)
      return content
    }
  },

  // Terminal
  terminal: {
    create: (cwd) => ipcRenderer.invoke('terminal-create', cwd),
    input:  (id, data) => ipcRenderer.send('terminal-input', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal-resize', id, cols, rows),
    kill:   (id) => ipcRenderer.invoke('terminal-kill', id),
    onOutput: (cb) => {
      const h = (_, id, data) => cb(id, data)
      ipcRenderer.on('terminal-output', h)
      return () => ipcRenderer.removeListener('terminal-output', h)
    },
    onExit: (cb) => {
      const h = (_, id) => cb(id)
      ipcRenderer.on('terminal-exit', h)
      return () => ipcRenderer.removeListener('terminal-exit', h)
    }
  },

  // IPC listeners (from main process)
  on: (channel, callback) => {
    const allowed = [
      'open-external-file',
      'theme-updated',
      'open-settings',
      'menu-new-file',
      'menu-open-file',
      'menu-open-folder',
      'menu-save',
      'menu-save-as',
      'menu-close-tab',
      'menu-view-mode',
      'menu-cycle-view',
      'menu-toggle-sidebar',
      'menu-toggle-terminal'
    ]
    if (allowed.includes(channel)) {
      const handler = (event, ...args) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  }
})
