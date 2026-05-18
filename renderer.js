/* globals api, Icons, SettingsManager, FileTree, TabManager, EditorManager, PreviewManager, GitManager */
'use strict'

// ─── DOM Reference Initializer ──────────────────────────────────────────────
function initDomRefs() {
  const $ = window.$;
  if (!$) return;

  window.sidebar              = $('sidebar');
  window.tabsList             = $('tabs-list');
  window.fileTreesContainer   = $('file-trees-container');
  window.panels               = $('panels');
  window.editorPanel          = $('editor-panel');
  window.previewPanel         = $('preview-panel');
  window.previewContent       = $('preview-content');
  window.htmlPreview          = $('html-preview');
  window.fileNameDisplay      = $('file-name-display');
  window.modifiedIndicator    = $('modified-indicator');
  window.splashScreen         = $('splash-screen');
  window.settingsOverlay      = $('settings-overlay');
  window.sidebarResizeHandle  = $('sidebar-resize-handle');
  window.panelsResizeHandle   = $('panels-resize-handle');
  window.terminalPanel        = $('terminal-panel');
  window.terminalTabs         = $('terminal-tabs');
  window.terminalSessions     = $('terminal-sessions');
  window.terminalResizeHandle = $('terminal-resize-handle');
}

// ─── Bridge Functions ────────────────────────────────────────────────────────
window.activeTab = () => (window.TabManager ? window.TabManager.activeTab() : null)
window.renderTabs = () => { if (window.TabManager) window.TabManager.renderTabs() }
window.updatePreview = () => { if (window.PreviewManager) window.PreviewManager.updatePreview() }
window.loadTabIntoEditor = (tab) => { if (window.EditorManager) window.EditorManager.loadTabIntoEditor(tab) }

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  if (typeof window.api === 'undefined') return  // loaded inside preview iframe, bail out
  
  console.log('CodeView: Initializing...')
  
  try {
    // 1. DOM refs
    initDomRefs()

    // 2. Global linking
    if (window.TabManager) {
      Object.defineProperty(window, 'tabs', {
        get: () => window.TabManager.tabs,
        set: (v) => { window.TabManager.tabs = v },
        configurable: true
      })
    }

    if (window.EditorManager) {
      Object.defineProperty(window, 'editor', {
        get: () => window.EditorManager.editor,
        set: (v) => { window.EditorManager.editor = v },
        configurable: true
      })
    }

    // 3. UI setup
    if (window.updateSplashScreen) window.updateSplashScreen()
    if (window.bindSplashButtons) window.bindSplashButtons()
    
    // 4. Data loading
    window.settings = await window.api.getSettings() || {}
    window.systemTheme = await window.api.getTheme() || 'dark'
    window.homeDir = await window.api.getHomeDir() || ''

    // 5. App startup
    window.applyTheme()
    
    if (window.EditorManager) window.EditorManager.applyEditorSettings()
    if (window.applyTerminalSettings) window.applyTerminalSettings()
    if (window.EditorManager) window.EditorManager.initEditor()
    
    window.initResizeHandles()
    window.bindToolbar()
    window.bindSidebarButtons()
    
    if (window.SettingsManager) window.SettingsManager.bindSettingsModal()
    
    window.bindMenuEvents()
    
    if (window.PreviewManager) window.PreviewManager.bindPreviewLinks()

    // 6. Restore session if enabled
    if (window.settings.restoreSession !== false && window.restoreSession) {
      await window.restoreSession()
    }

    // 7. Final UI sync (Wait a tick to ensure all async work is done)
    setTimeout(() => {
      window.updateSplashScreen()
    }, 50)
    console.log('CodeView: Initialization complete.')

    } catch (err) {
    console.error('CodeView: Initialization failed:', err)
    if (window.updateSplashScreen) window.updateSplashScreen()
  }
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function applyTheme() {
  let theme = window.settings.theme || 'system'
  if (theme === 'system') theme = window.systemTheme
  document.documentElement.setAttribute('data-theme', theme)
  if (window.editor) window.editor.setOption('theme', window.settings.editorTheme || 'default')
}
window.applyTheme = applyTheme

// ─── File operations ──────────────────────────────────────────────────────────
async function openFile(filePath, mode) {
  const result = await window.api.readFile(filePath)
  if (!result.success) { alert('Could not open file: ' + result.error); return }
  
  if (window.TabManager) {
    const tab = window.TabManager.createTab(result.filePath, result.content, result.type)
    if (mode === 'preview') window.setViewMode('preview')
    else if (mode === 'split') window.setViewMode('split')
    window.addToRecents(result.filePath)
  }
}
window.openFile = openFile

async function promptOpenFile() {
  const filePath = await window.api.showOpenDialog()
  if (filePath) await window.openFile(filePath)
}
window.promptOpenFile = promptOpenFile

async function saveCurrentTab() {
  const tab = window.activeTab()
  if (!tab) return
  if (!tab.filePath) { await window.saveAsCurrentTab(); return }
  const result = await window.api.writeFile(tab.filePath, tab.content)
  if (result.success) {
    tab.modified = false
    window.renderTabs()
    window.updateToolbarTitle()
  } else {
    alert('Save failed: ' + result.error)
  }
}
window.saveCurrentTab = saveCurrentTab

async function saveAsCurrentTab() {
  const tab = window.activeTab()
  if (!tab) return
  const defaultName = tab.filePath || (tab.type === 'json' ? 'untitled.json' : 'untitled.md')
  const filePath = await window.api.showSaveDialog(defaultName)
  if (!filePath) return
  const result = await window.api.writeFile(filePath, tab.content)
  if (result.success) {
    tab.filePath = filePath
    tab.name = filePath.split('/').pop()
    tab.modified = false
    tab.type = window.getTypeFromPath(filePath)
    window.renderTabs()
    window.updateToolbarTitle()
    window.updatePreview()
    window.addToRecents(filePath)
  }
}
window.saveAsCurrentTab = saveAsCurrentTab

function getTypeFromPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  const map = { md: 'markdown', markdown: 'markdown', json: 'json', html: 'html', htm: 'html',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'javascript', tsx: 'javascript',
    jsx: 'javascript', py: 'python', yaml: 'yaml', yml: 'yaml', sh: 'shell', bash: 'shell', zsh: 'shell',
    txt: 'text' }
  return map[ext] || 'markdown'
}
window.getTypeFromPath = getTypeFromPath

function newFile() {
  if (window.TabManager) window.TabManager.createTab(null, '', 'markdown')
}
window.newFile = newFile

// ─── Recents ──────────────────────────────────────────────────────────────────
function addToRecents(filePath) {
  let recents = window.settings.recentFiles || []
  recents = recents.filter(f => f !== filePath)
  recents.unshift(filePath)
  window.settings.recentFiles = recents.slice(0, 10)
  window.saveSettingsDebounced()
}
window.addToRecents = addToRecents

// ─── UI state ─────────────────────────────────────────────────────────────────
function updateToolbarTitle() {
  const tab = window.activeTab()
  if (!tab) {
    if (window.fileNameDisplay) window.fileNameDisplay.textContent = ''
    if (window.modifiedIndicator) window.modifiedIndicator.style.display = 'none'
    window.api.setTitle('CodeView')
    return
  }
  if (window.fileNameDisplay) window.fileNameDisplay.textContent = tab.name
  if (window.modifiedIndicator) window.modifiedIndicator.style.display = tab.modified ? '' : 'none'
  window.api.setTitle(tab.name + (tab.modified ? ' — Edited' : '') + ' — CodeView')
}
window.updateToolbarTitle = updateToolbarTitle

function updateSplashScreen() {
  const tabs = (window.TabManager && window.TabManager.tabs) ? window.TabManager.tabs : []
  const hasTab = tabs.length > 0
  const terminalVisible = !!window.terminalVisible
  
  const showSplash = !hasTab && !terminalVisible
  
  console.log(`CodeView: updateSplashScreen [hasTab: ${hasTab}, termVisible: ${terminalVisible}] => showSplash: ${showSplash}`)

  if (window.splashScreen) {
    window.splashScreen.style.display = showSplash ? 'flex' : 'none'
  }
  
  const mainContent = window.$('main-content')
  if (mainContent) {
    mainContent.style.visibility = (!showSplash) ? 'visible' : 'hidden'
  }

  if (!hasTab && window.splashScreen && showSplash) {
    const recents = (window.settings && window.settings.recentFiles) || []
    const list = window.$('splash-recents-list')
    if (list) {
      list.innerHTML = ''
      if (recents.length === 0) {
        list.innerHTML = '<div class="splash-no-recents">No recent files</div>'
      } else {
        recents.slice(0, 8).forEach(filePath => {
          const name = filePath.split('/').pop()
          const dir = filePath.split('/').slice(0, -1).join('/').replace(window.homeDir, '~')
          const item = document.createElement('div')
          item.className = 'recent-item'
          item.innerHTML = `
            <span class="recent-item-icon">${window.Icons ? window.Icons.iconForPath(name) : ''}</span>
            <span class="recent-item-name">${window.escHtml(name)}</span>
            <span class="recent-item-path">${window.escHtml(dir)}</span>
          `
          item.addEventListener('click', () => window.openFile(filePath))
          list.appendChild(item)
        })
      }
    }
  }
}
window.updateSplashScreen = updateSplashScreen

function setViewMode(mode) {
  window.viewMode = mode
  if (window.panels) window.panels.setAttribute('data-mode', mode)
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode)
  })
  if (window.editor) window.editor.refresh()
  window.updatePreview()
}
window.setViewMode = setViewMode

function toggleSidebar() {
  window.sidebarVisible = !window.sidebarVisible
  if (window.sidebar) window.sidebar.classList.toggle('hidden', !window.sidebarVisible)
  const app = window.$('app')
  if (app) app.classList.toggle('sidebar-hidden', !window.sidebarVisible)
  if (window.sidebarResizeHandle) window.sidebarResizeHandle.style.display = window.sidebarVisible ? '' : 'none'
  if (window.editor) window.editor.refresh()
}
window.toggleSidebar = toggleSidebar

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function bindToolbar() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => window.setViewMode(btn.dataset.mode))
  })
  const syncBtn = window.$('btn-sync-scroll')
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      window.syncScrollActive = !window.syncScrollActive
      window.settings.syncScroll = window.syncScrollActive
      window.api.setSettings(window.settings)
      syncBtn.classList.toggle('active', window.syncScrollActive)
    })
  }
  const termBtn = window.$('btn-toggle-terminal')
  if (termBtn) termBtn.addEventListener('click', window.toggleTerminal)
}
window.bindToolbar = bindToolbar

function bindSidebarButtons() {
  const btnNew = window.$('btn-new')
  if (btnNew) btnNew.addEventListener('click', window.newFile)
  
  const btnOpen = window.$('btn-open')
  if (btnOpen) btnOpen.addEventListener('click', window.promptOpenFile)
  
  const btnOpenFolder = window.$('btn-open-folder')
  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', async () => {
      const folderPath = await window.api.showFolderDialog()
      if (folderPath && window.FileTree) window.FileTree.addFolder(folderPath)
    })
  }
  
  const btnToggleSidebar = window.$('btn-sidebar-toggle')
  if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', window.toggleSidebar)
}
window.bindSidebarButtons = bindSidebarButtons

function bindSplashButtons() {
  const sOpen = window.$('splash-open-file')
  if (sOpen) sOpen.addEventListener('click', window.promptOpenFile)
  
  const sFolder = window.$('splash-open-folder')
  if (sFolder) {
    sFolder.addEventListener('click', async () => {
      const folderPath = await window.api.showFolderDialog()
      if (folderPath && window.FileTree) window.FileTree.addFolder(folderPath)
    })
  }
  
  const sNew = window.$('splash-new-file')
  if (sNew) sNew.addEventListener('click', window.newFile)
  
  const sTerm = window.$('splash-terminal')
  if (sTerm) {
    sTerm.addEventListener('click', () => {
      if (window.openTerminal) window.openTerminal(null, true)
    })
  }
}
window.bindSplashButtons = bindSplashButtons

// ─── Menu events ──────────────────────────────────────────────────────────────
function bindMenuEvents() {
  window.api.on('menu-new-file', window.newFile)
  window.api.on('menu-open-file', window.promptOpenFile)
  window.api.on('menu-open-folder', async () => {
    const folderPath = await window.api.showFolderDialog()
    if (folderPath && window.FileTree) window.FileTree.addFolder(folderPath)
  })
  window.api.on('menu-save', window.saveCurrentTab)
  window.api.on('menu-save-as', window.saveAsCurrentTab)
  window.api.on('menu-close-tab', () => { 
    const tab = window.activeTab(); 
    if (tab && window.TabManager) window.TabManager.closeTab(tab.id) 
  })
  window.api.on('menu-view-mode', (mode) => window.setViewMode(mode))
  window.api.on('menu-cycle-view', () => {
    const modes = ['editor', 'split', 'preview']
    const idx = modes.indexOf(window.viewMode)
    window.setViewMode(modes[(idx + 1) % modes.length])
  })
  window.api.on('menu-toggle-sidebar', window.toggleSidebar)
  window.api.on('menu-toggle-terminal', window.toggleTerminal)
  window.api.on('open-settings', () => {
    if (window.SettingsManager) window.SettingsManager.openSettings()
  })
  window.api.on('open-external-file', (filePath) => window.openFile(filePath))
}
window.bindMenuEvents = bindMenuEvents

// ─── Session ──────────────────────────────────────────────────────────────────
async function restoreSession() {
  const session = await window.api.getSession()
  if (!session) return
  
  if (session.openFiles && session.openFiles.length && window.TabManager) {
    for (const fileInfo of session.openFiles) {
      if (fileInfo.filePath) { await window.openFile(fileInfo.filePath) }
      else { window.TabManager.createTab(null, fileInfo.content || '', fileInfo.type || 'markdown') }
    }
    if (session.activeFile) {
      const tab = window.TabManager.tabs.find(t => t.filePath === session.activeFile)
      if (tab) window.TabManager.switchTab(tab.id)
    }
  }
  if (session.viewMode) window.setViewMode(session.viewMode)
  if (session.openFolders && session.openFolders.length && window.FileTree) {
    session.openFolders.forEach(f => {
      window.FileTree.openFolders.push({ path: f.path, name: f.name, expanded: f.expanded || {}, collapsed: f.collapsed || false })
    })
    window.FileTree.renderAllFolderSections()
  }
}
window.restoreSession = restoreSession

let sessionTimer = null
function saveSessionDebounced() {
  clearTimeout(sessionTimer)
  sessionTimer = setTimeout(persistSession, 1000)
}
window.saveSessionDebounced = saveSessionDebounced

function persistSession() {
  if (!window.TabManager || !window.FileTree) return
  const session = {
    openFiles: window.TabManager.tabs.map(t => ({ filePath: t.filePath, content: t.filePath ? undefined : t.content, type: t.type })),
    activeFile: window.activeTab()?.filePath || null,
    viewMode: window.viewMode,
    openFolders: window.FileTree.openFolders.map(f => ({ path: f.path, name: f.name, expanded: f.expanded, collapsed: f.collapsed }))
  }
  window.api.saveSession(session)
}

// ─── Resize handles ───────────────────────────────────────────────────────────
function initResizeHandles() {
  if (window.sidebarResizeHandle) {
    makeResizable(window.sidebarResizeHandle, 'col', (delta) => {
      const newWidth = Math.max(160, Math.min(380, window.sidebar.offsetWidth + delta))
      window.sidebar.style.width = newWidth + 'px'
    })
  }
  if (window.panelsResizeHandle) {
    makeResizable(window.panelsResizeHandle, 'col', (delta) => {
      const totalWidth = window.panels.offsetWidth
      const newEditorWidth = Math.max(200, Math.min(totalWidth - 200, window.editorPanel.offsetWidth + delta))
      window.editorPanel.style.flex = 'none'
      window.editorPanel.style.width = ((newEditorWidth / totalWidth) * 100).toFixed(2) + '%'
      window.previewPanel.style.flex = '1'
      if (window.editor) window.editor.refresh()
    })
  }
  if (window.terminalResizeHandle) {
    makeResizable(window.terminalResizeHandle, 'row', (delta) => {
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, window.terminalPanel.offsetHeight - delta))
      window.terminalPanel.style.height = newHeight + 'px'
      if (window.activeTerminalId !== null) {
        const t = window.terminals.get(window.activeTerminalId)
        if (t) t.fitAddon.fit()
      }
    })
  }
}
window.initResizeHandles = initResizeHandles

function makeResizable(handle, axis, onDelta) {
  let start = 0
  let dragging = false
  const cursor = axis === 'col' ? 'col-resize' : 'row-resize'
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault()
    dragging = true
    start = axis === 'col' ? e.clientX : e.clientY
    handle.classList.add('dragging')
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
  })
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const pos = axis === 'col' ? e.clientX : e.clientY
    onDelta(pos - start)
    start = pos
  })
  document.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    handle.classList.remove('dragging')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (window.editor) window.editor.refresh()
  })
}

// ─── Debounced saves ──────────────────────────────────────────────────────────
let settingsTimer = null
function saveSettingsDebounced() {
  clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => window.api.setSettings(window.settings), 400)
}
window.saveSettingsDebounced = saveSettingsDebounced

// ─── Start ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
