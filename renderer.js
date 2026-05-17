/* globals api, Icons, SettingsManager, FileTree, TabManager, EditorManager, PreviewManager, GitManager */
'use strict'

// ─── State ──────────────────────────────────────────────────────────────────
let isSyncScrolling = false

// Expose isSyncScrolling for managers
window.isSyncScrolling = isSyncScrolling

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const sidebar              = $('sidebar')
const tabsList             = $('tabs-list')
const fileTreesContainer   = $('file-trees-container')
const panels               = $('panels')
const editorPanel          = $('editor-panel')
const previewPanel         = $('preview-panel')
const previewContent       = $('preview-content')
const htmlPreview          = $('html-preview')
const fileNameDisplay      = $('file-name-display')
const modifiedIndicator    = $('modified-indicator')
const splashScreen         = $('splash-screen')
const settingsOverlay      = $('settings-overlay')
const sidebarResizeHandle  = $('sidebar-resize-handle')
const panelsResizeHandle   = $('panels-resize-handle')
const terminalPanel        = $('terminal-panel')
const terminalTabs         = $('terminal-tabs')
const terminalSessions     = $('terminal-sessions')
const terminalResizeHandle = $('terminal-resize-handle')

// Expose globals for other modules
window.$ = $
window.settings = {}
window.systemTheme = 'light'
window.tabs = [] // This will be linked to TabManager.tabs
window.fileTreesContainer = fileTreesContainer
window.settingsOverlay = settingsOverlay
window.previewPanel = previewPanel
window.previewContent = previewContent
window.htmlPreview = htmlPreview
window.tabsList = tabsList

// Expose DOM refs for terminal.js
window.terminalPanel = terminalPanel
window.terminalTabs = terminalTabs
window.terminalSessions = terminalSessions
window.terminalResizeHandle = terminalResizeHandle

// ─── Init ────────────────────────────────────────────────────────────────────
let homeDir = ''

async function init() {
  if (typeof api === 'undefined') return  // loaded inside preview iframe, bail out
  
  try {
    // Initial UI state setup
    updateSplashScreen()
    
    window.settings = await api.getSettings()
    window.systemTheme = await api.getTheme()
    homeDir = await api.getHomeDir()

    applyTheme()
    EditorManager.applyEditorSettings()
    window.applyTerminalSettings()
    EditorManager.initEditor()
    initResizeHandles()
    bindToolbar()
    bindSidebarButtons()
    bindSplashButtons()
    SettingsManager.bindSettingsModal()
    bindMenuEvents()
    PreviewManager.bindPreviewLinks()

    if (window.settings.restoreSession) {
      await restoreSession()
    }

    updateSplashScreen()
  } catch (err) {
    console.error('Initialization failed:', err)
    updateSplashScreen()
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

// Register theme listener
document.addEventListener('DOMContentLoaded', () => {
  if (typeof api !== 'undefined') {
    api.on('theme-updated', (newTheme) => {
      window.systemTheme = newTheme
      applyTheme()
    })
  }
})

// ─── Bridge Functions ────────────────────────────────────────────────────────
// These bridge the gap between managers to keep them decoupled but functional
window.activeTab = () => TabManager.activeTab()
window.renderTabs = () => TabManager.renderTabs()
window.updatePreview = () => PreviewManager.updatePreview()
window.loadTabIntoEditor = (tab) => EditorManager.loadTabIntoEditor(tab)

// ─── File operations ──────────────────────────────────────────────────────────
async function openFile(filePath, mode) {
  const result = await api.readFile(filePath)
  if (!result.success) { alert('Could not open file: ' + result.error); return }
  const tab = TabManager.createTab(result.filePath, result.content, result.type)
  if (mode === 'preview') setViewMode('preview')
  else if (mode === 'split') setViewMode('split')
  addToRecents(result.filePath)
}

window.openFile = openFile

async function promptOpenFile() {
  const filePath = await api.showOpenDialog()
  if (filePath) await openFile(filePath)
}

async function saveCurrentTab() {
  const tab = TabManager.activeTab()
  if (!tab) return
  if (!tab.filePath) { await saveAsCurrentTab(); return }
  const result = await api.writeFile(tab.filePath, tab.content)
  if (result.success) {
    tab.modified = false
    TabManager.renderTabs()
    updateToolbarTitle()
  } else {
    alert('Save failed: ' + result.error)
  }
}

window.saveCurrentTab = saveCurrentTab

async function saveAsCurrentTab() {
  const tab = TabManager.activeTab()
  if (!tab) return
  const defaultName = tab.filePath || (tab.type === 'json' ? 'untitled.json' : 'untitled.md')
  const filePath = await api.showSaveDialog(defaultName)
  if (!filePath) return
  const result = await api.writeFile(filePath, tab.content)
  if (result.success) {
    tab.filePath = filePath
    tab.name = filePath.split('/').pop()
    tab.modified = false
    tab.type = getTypeFromPath(filePath)
    TabManager.renderTabs()
    updateToolbarTitle()
    PreviewManager.updatePreview()
    addToRecents(filePath)
  }
}

function getTypeFromPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  const map = { md: 'markdown', markdown: 'markdown', json: 'json', html: 'html', htm: 'html',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'javascript', tsx: 'javascript',
    jsx: 'javascript', py: 'python', yaml: 'yaml', yml: 'yaml', sh: 'shell', bash: 'shell', zsh: 'shell',
    txt: 'text' }
  return map[ext] || 'markdown'
}

function newFile() {
  TabManager.createTab(null, '', 'markdown')
}

// ─── Recents ──────────────────────────────────────────────────────────────────
function addToRecents(filePath) {
  let recents = window.settings.recentFiles || []
  recents = recents.filter(f => f !== filePath)
  recents.unshift(filePath)
  window.settings.recentFiles = recents.slice(0, 10)
  saveSettingsDebounced()
}

// ─── UI state ─────────────────────────────────────────────────────────────────
function updateToolbarTitle() {
  const tab = TabManager.activeTab()
  if (!tab) {
    fileNameDisplay.textContent = ''
    modifiedIndicator.style.display = 'none'
    api.setTitle('CodeView')
    return
  }
  fileNameDisplay.textContent = tab.name
  modifiedIndicator.style.display = tab.modified ? '' : 'none'
  api.setTitle(tab.name + (tab.modified ? ' — Edited' : '') + ' — CodeView')
}

window.updateToolbarTitle = updateToolbarTitle

function updateSplashScreen() {
  const hasTab = TabManager.tabs.length > 0
  const showSplash = !hasTab && !window.terminalVisible
  splashScreen.style.display = showSplash ? 'flex' : 'none'
  $('main-content').style.visibility = (!showSplash) ? 'visible' : 'hidden'

  if (!hasTab) {
    const recents = window.settings.recentFiles || []
    const list = $('splash-recents-list')
    list.innerHTML = ''
    if (recents.length === 0) {
      list.innerHTML = '<div class="splash-no-recents">No recent files</div>'
    } else {
      recents.slice(0, 8).forEach(filePath => {
        const name = filePath.split('/').pop()
        const dir = filePath.split('/').slice(0, -1).join('/').replace(homeDir, '~')
        const item = document.createElement('div')
        item.className = 'recent-item'
        item.innerHTML = `
          <span class="recent-item-icon">${Icons.iconForPath(name)}</span>
          <span class="recent-item-name">${window.escHtml(name)}</span>
          <span class="recent-item-path">${window.escHtml(dir)}</span>
        `
        item.addEventListener('click', () => openFile(filePath))
        list.appendChild(item)
      })
    }
  }
}

window.updateSplashScreen = updateSplashScreen

function setViewMode(mode) {
  window.viewMode = mode
  panels.setAttribute('data-mode', mode)
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode)
  })
  if (window.editor) window.editor.refresh()
  PreviewManager.updatePreview()
}

function toggleSidebar() {
  window.sidebarVisible = !window.sidebarVisible
  sidebar.classList.toggle('hidden', !window.sidebarVisible)
  document.getElementById('app').classList.toggle('sidebar-hidden', !window.sidebarVisible)
  sidebarResizeHandle.style.display = window.sidebarVisible ? '' : 'none'
  if (window.editor) window.editor.refresh()
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function bindToolbar() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.mode))
  })

  $('btn-sync-scroll').addEventListener('click', () => {
    window.syncScrollActive = !window.syncScrollActive
    window.settings.syncScroll = window.syncScrollActive
    api.setSettings(window.settings)
    $('btn-sync-scroll').classList.toggle('active', window.syncScrollActive)
  })

  $('btn-toggle-terminal').addEventListener('click', window.toggleTerminal)
}

function bindSidebarButtons() {
  $('btn-new').addEventListener('click', newFile)
  $('btn-open').addEventListener('click', promptOpenFile)
  $('btn-open-folder').addEventListener('click', () => {
    const folderPath = api.showFolderDialog()
    if (folderPath) folderPath.then(path => path && FileTree.addFolder(path))
  })
  $('btn-sidebar-toggle').addEventListener('click', toggleSidebar)
}

function bindSplashButtons() {
  $('splash-open-file').addEventListener('click', promptOpenFile)
  $('splash-open-folder').addEventListener('click', async () => {
    const folderPath = await api.showFolderDialog()
    if (folderPath) FileTree.addFolder(folderPath)
  })
  $('splash-new-file').addEventListener('click', newFile)
  $('splash-terminal').addEventListener('click', () => {
    window.openTerminal(null, true)
  })
}

// ─── Menu events ──────────────────────────────────────────────────────────────
function bindMenuEvents() {
  api.on('menu-new-file', newFile)
  api.on('menu-open-file', promptOpenFile)
  api.on('menu-open-folder', async () => {
    const folderPath = await api.showFolderDialog()
    if (folderPath) FileTree.addFolder(folderPath)
  })
  api.on('menu-save', saveCurrentTab)
  api.on('menu-save-as', saveAsCurrentTab)
  api.on('menu-close-tab', () => { const tab = TabManager.activeTab(); if (tab) TabManager.closeTab(tab.id) })
  api.on('menu-view-mode', (mode) => setViewMode(mode))
  api.on('menu-cycle-view', () => {
    const modes = ['editor', 'split', 'preview']
    const idx = modes.indexOf(window.viewMode)
    setViewMode(modes[(idx + 1) % modes.length])
  })
  api.on('menu-toggle-sidebar', toggleSidebar)
  api.on('menu-toggle-terminal', window.toggleTerminal)
  api.on('open-settings', SettingsManager.openSettings)
  api.on('open-external-file', (filePath) => openFile(filePath))
}

// ─── Session ──────────────────────────────────────────────────────────────────
async function restoreSession() {
  const session = await api.getSession()
  if (!session) return

  if (session.openFiles && session.openFiles.length) {
    for (const fileInfo of session.openFiles) {
      if (fileInfo.filePath) {
        await openFile(fileInfo.filePath)
      } else {
        TabManager.createTab(null, fileInfo.content || '', fileInfo.type || 'markdown')
      }
    }
    if (session.activeFile) {
      const tab = TabManager.tabs.find(t => t.filePath === session.activeFile)
      if (tab) TabManager.switchTab(tab.id)
    }
  }

  if (session.viewMode) setViewMode(session.viewMode)

  if (session.openFolders && session.openFolders.length) {
    session.openFolders.forEach(f => {
      FileTree.openFolders.push({ path: f.path, name: f.name, expanded: f.expanded || {}, collapsed: f.collapsed || false })
    })
    FileTree.renderAllFolderSections()
  }
}

let sessionTimer = null
function saveSessionDebounced() {
  clearTimeout(sessionTimer)
  sessionTimer = setTimeout(persistSession, 1000)
}

window.saveSessionDebounced = saveSessionDebounced

function persistSession() {
  const session = {
    openFiles: TabManager.tabs.map(t => ({ filePath: t.filePath, content: t.filePath ? undefined : t.content, type: t.type })),
    activeFile: TabManager.activeTab()?.filePath || null,
    viewMode: window.viewMode,
    openFolders: FileTree.openFolders.map(f => ({ path: f.path, name: f.name, expanded: f.expanded, collapsed: f.collapsed }))
  }
  api.saveSession(session)
}

// ─── Resize handles ───────────────────────────────────────────────────────────
function initResizeHandles() {
  makeResizable(sidebarResizeHandle, 'col', (delta) => {
    const newWidth = Math.max(160, Math.min(380, sidebar.offsetWidth + delta))
    sidebar.style.width = newWidth + 'px'
  })

  makeResizable(panelsResizeHandle, 'col', (delta) => {
    const totalWidth = panels.offsetWidth
    const newEditorWidth = Math.max(200, Math.min(totalWidth - 200, editorPanel.offsetWidth + delta))
    editorPanel.style.flex = 'none'
    editorPanel.style.width = ((newEditorWidth / totalWidth) * 100).toFixed(2) + '%'
    previewPanel.style.flex = '1'
    if (window.editor) window.editor.refresh()
  })

  makeResizable(terminalResizeHandle, 'row', (delta) => {
    const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, terminalPanel.offsetHeight - delta))
    terminalPanel.style.height = newHeight + 'px'
    if (window.activeTerminalId !== null) {
      const t = window.terminals.get(window.activeTerminalId)
      if (t) t.fitAddon.fit()
    }
  })
}

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
  settingsTimer = setTimeout(() => api.setSettings(window.settings), 400)
}

window.saveSettingsDebounced = saveSettingsDebounced

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

window.escHtml = escHtml

// Expose editor for other modules
Object.defineProperty(window, 'editor', {
  get: () => EditorManager.editor,
  set: (v) => { EditorManager.editor = v }
})

// ─── Start ────────────────────────────────────────────────────────────────────
init()
