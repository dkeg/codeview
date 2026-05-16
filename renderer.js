/* globals CodeMirror, Terminal, FitAddon, WebLinksAddon, api */
'use strict'

// ─── State ──────────────────────────────────────────────────────────────────
let tabs = []
let activeTabId = null
let nextTabId = 1
let settings = {}
let systemTheme = 'light'
let viewMode = 'split'
let sidebarVisible = true
let openFolders = []       // [{ path, name, expanded: {} }]
let syncScrollActive = false
let isSyncScrolling = false
let editor = null

// Terminal state
let terminals = new Map()   // id -> { xterm, fitAddon, sessionEl, tabEl }
let activeTerminalId = null
let nextTermId = 1
let terminalVisible = false
let terminalMaximized = false

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

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  settings = await api.getSettings()
  systemTheme = await api.getTheme()

  applyTheme()
  applyEditorSettings()
  applyTerminalSettings()
  initEditor()
  initResizeHandles()
  bindToolbar()
  bindSidebarButtons()
  bindSplashButtons()
  bindSettingsModal()
  bindMenuEvents()
  bindPreviewLinks()

  if (settings.restoreSession) {
    await restoreSession()
  }

  updateSplashScreen()
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function applyTheme() {
  let theme = settings.theme || 'system'
  if (theme === 'system') theme = systemTheme
  document.documentElement.setAttribute('data-theme', theme)
  if (editor) editor.setOption('theme', 'default')
}

api.on('theme-updated', (newTheme) => {
  systemTheme = newTheme
  applyTheme()
})

// ─── Editor ──────────────────────────────────────────────────────────────────
function initEditor() {
  const textarea = $('editor-textarea')
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'markdown',
    theme: 'default',
    lineNumbers: settings.lineNumbers !== false,
    lineWrapping: true,
    autofocus: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    extraKeys: {
      'Cmd-S': () => saveCurrentTab(),
      'Ctrl-S': () => saveCurrentTab()
    }
  })

  editor.on('change', () => {
    const tab = activeTab()
    if (!tab) return
    tab.content = editor.getValue()
    if (!tab.modified) {
      tab.modified = true
      renderTabs()
      updateToolbarTitle()
    }
    updatePreview()
  })

  editor.on('scroll', () => {
    if (!syncScrollActive || isSyncScrolling) return
    isSyncScrolling = true
    const info = editor.getScrollInfo()
    const ratio = info.top / (info.height - info.clientHeight)
    const previewMax = previewPanel.scrollHeight - previewPanel.clientHeight
    previewPanel.scrollTop = ratio * previewMax
    requestAnimationFrame(() => { isSyncScrolling = false })
  })

  previewPanel.addEventListener('scroll', () => {
    if (!syncScrollActive || isSyncScrolling) return
    isSyncScrolling = true
    const ratio = previewPanel.scrollTop / (previewPanel.scrollHeight - previewPanel.clientHeight)
    const info = editor.getScrollInfo()
    editor.scrollTo(null, ratio * (info.height - info.clientHeight))
    requestAnimationFrame(() => { isSyncScrolling = false })
  })

  applyEditorSettings()
}

function getEditorMode(type) {
  switch (type) {
    case 'json':       return { name: 'javascript', json: true }
    case 'html':       return 'htmlmixed'
    case 'javascript': return 'javascript'
    case 'python':     return 'python'
    case 'yaml':       return 'yaml'
    case 'shell':      return 'shell'
    default:           return 'markdown'
  }
}

function applyEditorSettings() {
  const ff = settings.fontFamily || "'SF Mono', monospace"
  const fs = (settings.fontSize || 14) + 'px'
  const sm = (settings.sideMargin || 24) + 'px'
  const tbm = (settings.tbMargin || 16) + 'px'
  document.documentElement.style.setProperty('--editor-font-family', ff)
  document.documentElement.style.setProperty('--editor-font-size', fs)
  document.documentElement.style.setProperty('--editor-side-margin', sm)
  document.documentElement.style.setProperty('--editor-tb-margin', tbm)

  if (editor) {
    editor.setOption('lineNumbers', settings.lineNumbers !== false)
    editor.refresh()
  }

  syncScrollActive = settings.syncScroll !== false
  $('btn-sync-scroll').classList.toggle('active', syncScrollActive)
}

function applyTerminalSettings() {
  const pad = (settings.termPadding || 8) + 'px'
  document.documentElement.style.setProperty('--term-padding', pad)

  // Update all active terminal instances
  terminals.forEach(({ xterm }) => {
    if (!xterm) return
    const ff = settings.termFontFamily || "'SF Mono', monospace"
    const fs = settings.termFontSize || 13
    const lh = (settings.termLineHeight || 14) / 10
    const ls = settings.termLetterSpacing || 0
    const cursor = settings.termCursorStyle || 'block'
    xterm.options.fontFamily = ff
    xterm.options.fontSize = fs
    xterm.options.lineHeight = lh
    xterm.options.letterSpacing = ls
    xterm.options.cursorStyle = cursor
  })
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function activeTab() {
  return tabs.find(t => t.id === activeTabId) || null
}

function createTab(filePath, content, type) {
  if (filePath) {
    const existing = tabs.find(t => t.filePath === filePath)
    if (existing) { switchTab(existing.id); return existing }
  }
  const id = nextTabId++
  const name = filePath ? filePath.split('/').pop() : 'Untitled'
  const tab = { id, filePath, name, content: content || '', type: type || 'markdown', modified: !filePath }
  tabs.push(tab)
  switchTab(id)
  return tab
}

function switchTab(id) {
  const tab = tabs.find(t => t.id === id)
  if (!tab) return
  activeTabId = id
  renderTabs()
  loadTabIntoEditor(tab)
  updateToolbarTitle()
  updateSplashScreen()
  saveSessionDebounced()
}

function closeTab(id) {
  const tab = tabs.find(t => t.id === id)
  if (!tab) return

  if (tab.modified) {
    if (!confirm(`Save changes to "${tab.name}" before closing?`)) return
    if (tab.filePath) api.writeFile(tab.filePath, tab.content)
  }

  const idx = tabs.indexOf(tab)
  tabs.splice(idx, 1)

  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || null
    activeTabId = next ? next.id : null
    if (next) {
      loadTabIntoEditor(next)
    } else {
      editor && editor.setValue('')
      fileNameDisplay.textContent = ''
      modifiedIndicator.style.display = 'none'
    }
  }

  renderTabs()
  updateToolbarTitle()
  updateSplashScreen()
  saveSessionDebounced()
}

function loadTabIntoEditor(tab) {
  editor.setOption('mode', getEditorMode(tab.type))
  editor.setValue(tab.content)
  editor.clearHistory()
  editor.focus()
  updatePreview()
}

function renderTabs() {
  if (tabs.length === 0) {
    tabsList.innerHTML = '<div class="tabs-empty">No open files</div>'
    return
  }
  tabsList.innerHTML = ''
  tabs.forEach(tab => {
    const el = document.createElement('div')
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '')
    el.dataset.id = tab.id
    el.innerHTML = `
      <span class="tab-icon">${iconForType(tab.type)}</span>
      <span class="tab-name">${escHtml(tab.name)}</span>
      <span class="tab-modified"></span>
      <button class="tab-close" title="Close">
        <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>
      </button>
    `
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return
      switchTab(tab.id)
    })
    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(tab.id)
    })
    tabsList.appendChild(el)
  })
}

// ─── Preview ─────────────────────────────────────────────────────────────────
function updatePreview() {
  const tab = activeTab()
  htmlPreview.style.display = 'none'
  previewContent.style.display = ''

  if (!tab) { previewContent.innerHTML = ''; return }

  if (tab.type === 'html') {
    previewContent.style.display = 'none'
    htmlPreview.style.display = 'block'
    htmlPreview.srcdoc = tab.content
    return
  }

  if (tab.type === 'json') {
    try {
      const parsed = JSON.parse(tab.content)
      previewContent.className = 'json-preview'
      previewContent.textContent = JSON.stringify(parsed, null, 2)
    } catch {
      previewContent.className = 'json-preview'
      previewContent.textContent = tab.content
    }
    return
  }

  // Default: markdown render (also used for plain text types)
  previewContent.className = ''
  previewContent.innerHTML = api.renderMarkdown(tab.content)
  previewContent.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = true })
}

function bindPreviewLinks() {
  previewContent.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]')
    if (!link) return
    const href = link.getAttribute('href')
    if (!href || href.startsWith('#')) return
    e.preventDefault()
    if (href.startsWith('http://') || href.startsWith('https://')) {
      api.openExternal(href)
    }
  })
}

// ─── File operations ──────────────────────────────────────────────────────────
async function openFile(filePath, mode) {
  const result = await api.readFile(filePath)
  if (!result.success) { alert('Could not open file: ' + result.error); return }
  const tab = createTab(result.filePath, result.content, result.type)
  if (mode === 'preview') setViewMode('preview')
  else if (mode === 'split') setViewMode('split')
  addToRecents(result.filePath)
}

async function promptOpenFile() {
  const filePath = await api.showOpenDialog()
  if (filePath) await openFile(filePath)
}

async function promptOpenFolder() {
  const folderPath = await api.showFolderDialog()
  if (folderPath) addFolder(folderPath)
}

function addFolder(folderPath) {
  if (openFolders.find(f => f.path === folderPath)) return
  const name = folderPath.split('/').pop()
  openFolders.push({ path: folderPath, name, expanded: {}, collapsed: false })
  renderAllFolderSections()
  saveSessionDebounced()
}

function removeFolder(folderPath) {
  openFolders = openFolders.filter(f => f.path !== folderPath)
  renderAllFolderSections()
  saveSessionDebounced()
}

function renderAllFolderSections() {
  fileTreesContainer.innerHTML = ''
  openFolders.forEach(folder => renderFolderSection(folder))
}

function renderFolderSection(folder) {
  const section = document.createElement('div')
  section.className = 'folder-section' + (folder.collapsed ? ' collapsed' : '')
  section.dataset.path = folder.path

  section.innerHTML = `
    <div class="folder-section-header">
      <svg class="folder-section-toggle" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
      </svg>
      <span class="folder-section-name">${escHtml(folder.name)}</span>
      <button class="folder-section-remove" title="Remove folder">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>
      </button>
      <button class="icon-btn btn-new-in-folder" title="New file in folder" style="width:18px;height:18px;display:none;">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
        </svg>
      </button>
    </div>
    <div class="folder-section-tree"></div>
  `

  const header = section.querySelector('.folder-section-header')
  const removeBtn = section.querySelector('.folder-section-remove')
  const treeEl = section.querySelector('.folder-section-tree')

  header.addEventListener('click', (e) => {
    if (e.target.closest('.folder-section-remove')) return
    folder.collapsed = !folder.collapsed
    section.classList.toggle('collapsed', folder.collapsed)
    saveSessionDebounced()
  })

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    removeFolder(folder.path)
  })

  fileTreesContainer.appendChild(section)
  renderFileTree(folder.path, treeEl, 0, folder)
}

async function renderFileTree(dirPath, container, depth, folder) {
  container.innerHTML = ''
  let entries
  try { entries = await api.readDir(dirPath) } catch { return }

  for (const entry of entries) {
    const item = document.createElement('div')
    item.className = 'tree-item' + (entry.isDirectory ? ' directory' : '')
    item.style.paddingLeft = (6 + depth * 14) + 'px'

    const icon = entry.isDirectory ? iconFolder() : iconForPath(entry.name)
    item.innerHTML = `<span class="tree-item-icon">${icon}</span><span class="tree-item-name">${escHtml(entry.name)}</span>`

    if (entry.isDirectory) {
      const childContainer = document.createElement('div')
      childContainer.className = 'tree-children'
      childContainer.style.display = folder.expanded[entry.path] ? 'block' : 'none'

      item.addEventListener('click', async () => {
        const isOpen = childContainer.style.display !== 'none'
        childContainer.style.display = isOpen ? 'none' : 'block'
        folder.expanded[entry.path] = !isOpen
        if (!isOpen && childContainer.children.length === 0) {
          await renderFileTree(entry.path, childContainer, depth + 1, folder)
        }
      })

      container.appendChild(item)
      container.appendChild(childContainer)
      if (folder.expanded[entry.path]) {
        await renderFileTree(entry.path, childContainer, depth + 1, folder)
      }
    } else {
      if (!isEditableFile(entry.name)) item.style.opacity = '0.45'

      item.addEventListener('click', async () => {
        container.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'))
        item.classList.add('active')
        if (isEditableFile(entry.name)) await openFile(entry.path)
      })

      container.appendChild(item)
    }
  }
}

function isEditableFile(name) {
  return /\.(md|markdown|json|html?|jsx?|mjs|cjs|tsx?|py|ya?ml|sh|bash|zsh|txt)$/i.test(name)
}

async function saveCurrentTab() {
  const tab = activeTab()
  if (!tab) return
  if (!tab.filePath) { await saveAsCurrentTab(); return }
  const result = await api.writeFile(tab.filePath, tab.content)
  if (result.success) {
    tab.modified = false
    renderTabs()
    updateToolbarTitle()
  } else {
    alert('Save failed: ' + result.error)
  }
}

async function saveAsCurrentTab() {
  const tab = activeTab()
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
    renderTabs()
    updateToolbarTitle()
    updatePreview()
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
  createTab(null, '', 'markdown')
}

// ─── Recents ──────────────────────────────────────────────────────────────────
function addToRecents(filePath) {
  let recents = settings.recentFiles || []
  recents = recents.filter(f => f !== filePath)
  recents.unshift(filePath)
  settings.recentFiles = recents.slice(0, 10)
  saveSettingsDebounced()
}

// ─── UI state ─────────────────────────────────────────────────────────────────
function updateToolbarTitle() {
  const tab = activeTab()
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

function updateSplashScreen() {
  const hasTab = tabs.length > 0
  splashScreen.style.display = hasTab ? 'none' : 'flex'
  $('main-content').style.visibility = hasTab ? 'visible' : 'hidden'

  if (!hasTab) {
    const recents = settings.recentFiles || []
    const list = $('splash-recents-list')
    list.innerHTML = ''
    if (recents.length === 0) {
      list.innerHTML = '<div class="splash-no-recents">No recent files</div>'
    } else {
      recents.slice(0, 8).forEach(filePath => {
        const name = filePath.split('/').pop()
        const dir = filePath.split('/').slice(0, -1).join('/').replace(process.env && process.env.HOME ? process.env.HOME : '', '~')
        const item = document.createElement('div')
        item.className = 'recent-item'
        item.innerHTML = `
          <span class="recent-item-icon">${iconForPath(name)}</span>
          <span class="recent-item-name">${escHtml(name)}</span>
          <span class="recent-item-path">${escHtml(dir)}</span>
        `
        item.addEventListener('click', () => openFile(filePath))
        list.appendChild(item)
      })
    }
  }
}

function setViewMode(mode) {
  viewMode = mode
  panels.setAttribute('data-mode', mode)
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode)
  })
  editor && editor.refresh()
}

function toggleSidebar() {
  sidebarVisible = !sidebarVisible
  sidebar.classList.toggle('hidden', !sidebarVisible)
  sidebarResizeHandle.style.display = sidebarVisible ? '' : 'none'
  editor && editor.refresh()
}

// ─── Terminal ─────────────────────────────────────────────────────────────────
async function openTerminal(cwd) {
  if (!terminalVisible) {
    terminalVisible = true
    terminalPanel.style.display = 'flex'
    terminalResizeHandle.style.display = ''
    $('btn-toggle-terminal').classList.add('active')
  }

  if (terminals.size === 0) {
    await createTerminalSession(cwd)
    return
  }

  if (activeTerminalId !== null) {
    const t = terminals.get(activeTerminalId)
    if (t) t.fitAddon.fit()
  }
}

async function createTerminalSession(cwd) {
  const id = nextTermId++
  const openCwd = cwd || (openFolders.length > 0 ? openFolders[0].path : null)

  const sessionEl = document.createElement('div')
  sessionEl.className = 'term-session'
  sessionEl.id = 'term-session-' + id
  terminalSessions.appendChild(sessionEl)

  const ff = settings.termFontFamily || "'SF Mono', monospace"
  const fs = settings.termFontSize || 13
  const lh = (settings.termLineHeight || 14) / 10
  const ls = settings.termLetterSpacing || 0
  const cursor = settings.termCursorStyle || 'block'

  const xterm = new Terminal({
    fontFamily: ff,
    fontSize: fs,
    lineHeight: lh,
    letterSpacing: ls,
    cursorStyle: cursor,
    cursorBlink: true,
    theme: {
      background: '#0d0d0f',
      foreground: '#f2f2f7',
      cursor: '#0A84FF',
      selectionBackground: 'rgba(10, 132, 255, 0.3)',
      black: '#1c1c1e',
      brightBlack: '#636366',
      red: '#FF453A',
      brightRed: '#FF6961',
      green: '#32D74B',
      brightGreen: '#30DB5B',
      yellow: '#FFD60A',
      brightYellow: '#FFD426',
      blue: '#0A84FF',
      brightBlue: '#409CFF',
      magenta: '#BF5AF2',
      brightMagenta: '#DA8FFF',
      cyan: '#5AC8FA',
      brightCyan: '#70D7FF',
      white: '#EBEBF5',
      brightWhite: '#FFFFFF'
    },
    allowTransparency: true
  })

  const fitAddon = new FitAddon()
  const webLinksAddon = new WebLinksAddon((e, uri) => api.openExternal(uri))
  xterm.loadAddon(fitAddon)
  xterm.loadAddon(webLinksAddon)
  xterm.open(sessionEl)
  fitAddon.fit()

  const termId = await api.terminal.create(openCwd)

  api.terminal.onOutput((evtId, data) => {
    if (evtId !== termId) return
    // Intercept magic open commands from mview shell function
    const magic = data.match(/__CV_OPEN__:([^:]+):([^\r\n]+)/)
    if (magic) {
      const mode = magic[1]
      const filePath = magic[2].trim()
      openFile(filePath, mode)
      return
    }
    xterm.write(data)
  })

  api.terminal.onExit((evtId) => {
    if (evtId !== termId) return
    closeTerminalSession(id)
  })

  xterm.onData(data => api.terminal.input(termId, data))

  xterm.onResize(({ cols, rows }) => api.terminal.resize(termId, cols, rows))

  const tabEl = document.createElement('div')
  tabEl.className = 'term-tab'
  tabEl.dataset.id = id
  tabEl.innerHTML = `
    <span>zsh ${id}</span>
    <span class="term-tab-close">
      <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
      </svg>
    </span>
  `
  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.term-tab-close')) return
    switchTerminalSession(id)
  })
  tabEl.querySelector('.term-tab-close').addEventListener('click', (e) => {
    e.stopPropagation()
    closeTerminalSession(id)
  })
  terminalTabs.appendChild(tabEl)

  terminals.set(id, { xterm, fitAddon, sessionEl, tabEl, termId })
  switchTerminalSession(id)
}

function switchTerminalSession(id) {
  terminals.forEach(({ sessionEl, tabEl }, tid) => {
    const active = tid === id
    sessionEl.classList.toggle('active', active)
    tabEl.classList.toggle('active', active)
  })
  activeTerminalId = id
  const t = terminals.get(id)
  if (t) {
    requestAnimationFrame(() => {
      t.fitAddon.fit()
      t.xterm.focus()
    })
  }
}

function closeTerminalSession(id) {
  const t = terminals.get(id)
  if (!t) return
  api.terminal.kill(t.termId)
  t.xterm.dispose()
  t.sessionEl.remove()
  t.tabEl.remove()
  terminals.delete(id)

  if (terminals.size === 0) {
    hideTerminal()
  } else if (activeTerminalId === id) {
    const firstId = terminals.keys().next().value
    switchTerminalSession(firstId)
  }
}

function hideTerminal() {
  terminalVisible = false
  terminalMaximized = false
  terminalPanel.style.display = 'none'
  terminalPanel.classList.remove('maximized')
  terminalResizeHandle.style.display = 'none'
  $('btn-toggle-terminal').classList.remove('active')
  editor && editor.refresh()
}

function toggleTerminal() {
  if (terminalVisible) {
    if (terminals.size === 0) {
      hideTerminal()
    } else {
      hideTerminal()
    }
  } else {
    openTerminal()
  }
}

function toggleTerminalMaximize() {
  terminalMaximized = !terminalMaximized
  terminalPanel.classList.toggle('maximized', terminalMaximized)
  if (activeTerminalId !== null) {
    const t = terminals.get(activeTerminalId)
    if (t) requestAnimationFrame(() => t.fitAddon.fit())
  }
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function bindToolbar() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.mode))
  })

  $('btn-sync-scroll').addEventListener('click', () => {
    syncScrollActive = !syncScrollActive
    settings.syncScroll = syncScrollActive
    api.setSettings(settings)
    $('btn-sync-scroll').classList.toggle('active', syncScrollActive)
  })

  $('btn-toggle-terminal').addEventListener('click', toggleTerminal)
}

function bindSidebarButtons() {
  $('btn-new').addEventListener('click', newFile)
  $('btn-open').addEventListener('click', promptOpenFile)
  $('btn-open-folder').addEventListener('click', promptOpenFolder)
}

function bindSplashButtons() {
  $('splash-open-file').addEventListener('click', promptOpenFile)
  $('splash-open-folder').addEventListener('click', promptOpenFolder)
  $('splash-new-file').addEventListener('click', newFile)
  $('splash-terminal').addEventListener('click', () => {
    updateSplashScreen()
    openTerminal()
  })
}

// ─── Menu events ──────────────────────────────────────────────────────────────
function bindMenuEvents() {
  api.on('menu-new-file', newFile)
  api.on('menu-open-file', promptOpenFile)
  api.on('menu-open-folder', promptOpenFolder)
  api.on('menu-save', saveCurrentTab)
  api.on('menu-save-as', saveAsCurrentTab)
  api.on('menu-close-tab', () => { const tab = activeTab(); if (tab) closeTab(tab.id) })
  api.on('menu-view-mode', (mode) => setViewMode(mode))
  api.on('menu-cycle-view', () => {
    const modes = ['editor', 'split', 'preview']
    const idx = modes.indexOf(viewMode)
    setViewMode(modes[(idx + 1) % modes.length])
  })
  api.on('menu-toggle-sidebar', toggleSidebar)
  api.on('menu-toggle-terminal', toggleTerminal)
  api.on('open-settings', openSettings)
  api.on('open-external-file', (filePath) => openFile(filePath))
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function openSettings() {
  settingsOverlay.style.display = 'flex'

  // Editor tab
  $('setting-font-family').value = settings.fontFamily || "'SF Mono', monospace"
  $('setting-font-size').value = settings.fontSize || 14
  $('font-size-display').textContent = (settings.fontSize || 14) + 'px'
  $('setting-side-margin').value = settings.sideMargin || 24
  $('side-margin-display').textContent = (settings.sideMargin || 24) + 'px'
  $('setting-tb-margin').value = settings.tbMargin || 16
  $('tb-margin-display').textContent = (settings.tbMargin || 16) + 'px'
  $('setting-line-numbers').checked = settings.lineNumbers !== false
  $('setting-sync-scroll').checked = settings.syncScroll !== false

  // Terminal tab
  $('setting-term-font-family').value = settings.termFontFamily || "'SF Mono', monospace"
  $('setting-term-font-size').value = settings.termFontSize || 13
  $('term-font-size-display').textContent = (settings.termFontSize || 13) + 'px'
  $('setting-term-padding').value = settings.termPadding || 8
  $('term-padding-display').textContent = (settings.termPadding || 8) + 'px'
  $('setting-term-line-height').value = (settings.termLineHeight || 14)
  $('term-line-height-display').textContent = ((settings.termLineHeight || 14) / 10).toFixed(1)
  $('setting-term-letter-spacing').value = settings.termLetterSpacing || 0
  $('term-letter-spacing-display').textContent = (settings.termLetterSpacing || 0) + 'px'
  $('setting-term-cursor').value = settings.termCursorStyle || 'block'

  // General tab
  $('setting-theme').value = settings.theme || 'system'
  $('setting-restore-session').checked = settings.restoreSession !== false
}

function bindSettingsModal() {
  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'))
      tab.classList.add('active')
      $('settings-panel-' + tab.dataset.tab).classList.add('active')
    })
  })

  $('settings-close').addEventListener('click', closeSettings)
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings() })

  // Editor settings
  $('setting-font-family').addEventListener('change', (e) => {
    settings.fontFamily = e.target.value
    applyEditorSettings()
    saveSettingsDebounced()
  })
  $('setting-font-size').addEventListener('input', (e) => {
    settings.fontSize = parseInt(e.target.value, 10)
    $('font-size-display').textContent = settings.fontSize + 'px'
    applyEditorSettings()
    saveSettingsDebounced()
  })
  $('setting-side-margin').addEventListener('input', (e) => {
    settings.sideMargin = parseInt(e.target.value, 10)
    $('side-margin-display').textContent = settings.sideMargin + 'px'
    applyEditorSettings()
    saveSettingsDebounced()
  })
  $('setting-tb-margin').addEventListener('input', (e) => {
    settings.tbMargin = parseInt(e.target.value, 10)
    $('tb-margin-display').textContent = settings.tbMargin + 'px'
    applyEditorSettings()
    saveSettingsDebounced()
  })
  $('setting-line-numbers').addEventListener('change', (e) => {
    settings.lineNumbers = e.target.checked
    applyEditorSettings()
    saveSettingsDebounced()
  })
  $('setting-sync-scroll').addEventListener('change', (e) => {
    settings.syncScroll = e.target.checked
    syncScrollActive = e.target.checked
    $('btn-sync-scroll').classList.toggle('active', syncScrollActive)
    saveSettingsDebounced()
  })

  // Terminal settings
  $('setting-term-font-family').addEventListener('change', (e) => {
    settings.termFontFamily = e.target.value
    applyTerminalSettings()
    saveSettingsDebounced()
  })
  $('setting-term-font-size').addEventListener('input', (e) => {
    settings.termFontSize = parseInt(e.target.value, 10)
    $('term-font-size-display').textContent = settings.termFontSize + 'px'
    applyTerminalSettings()
    saveSettingsDebounced()
  })
  $('setting-term-padding').addEventListener('input', (e) => {
    settings.termPadding = parseInt(e.target.value, 10)
    $('term-padding-display').textContent = settings.termPadding + 'px'
    applyTerminalSettings()
    saveSettingsDebounced()
  })
  $('setting-term-line-height').addEventListener('input', (e) => {
    settings.termLineHeight = parseInt(e.target.value, 10)
    $('term-line-height-display').textContent = (settings.termLineHeight / 10).toFixed(1)
    applyTerminalSettings()
    saveSettingsDebounced()
  })
  $('setting-term-letter-spacing').addEventListener('input', (e) => {
    settings.termLetterSpacing = parseInt(e.target.value, 10)
    $('term-letter-spacing-display').textContent = settings.termLetterSpacing + 'px'
    applyTerminalSettings()
    saveSettingsDebounced()
  })
  $('setting-term-cursor').addEventListener('change', (e) => {
    settings.termCursorStyle = e.target.value
    applyTerminalSettings()
    saveSettingsDebounced()
  })

  // General settings
  $('setting-theme').addEventListener('change', (e) => {
    settings.theme = e.target.value
    applyTheme()
    saveSettingsDebounced()
  })
  $('setting-restore-session').addEventListener('change', (e) => {
    settings.restoreSession = e.target.checked
    saveSettingsDebounced()
  })

  // Terminal panel buttons
  $('btn-terminal-new').addEventListener('click', () => createTerminalSession())
  $('btn-terminal-maximize').addEventListener('click', toggleTerminalMaximize)
  $('btn-terminal-close').addEventListener('click', toggleTerminal)
}

function closeSettings() {
  settingsOverlay.style.display = 'none'
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
        createTab(null, fileInfo.content || '', fileInfo.type || 'markdown')
      }
    }
    if (session.activeFile) {
      const tab = tabs.find(t => t.filePath === session.activeFile)
      if (tab) switchTab(tab.id)
    }
  }

  if (session.viewMode) setViewMode(session.viewMode)

  if (session.openFolders && session.openFolders.length) {
    session.openFolders.forEach(f => {
      openFolders.push({ path: f.path, name: f.name, expanded: f.expanded || {}, collapsed: f.collapsed || false })
    })
    renderAllFolderSections()
  }
}

let sessionTimer = null
function saveSessionDebounced() {
  clearTimeout(sessionTimer)
  sessionTimer = setTimeout(persistSession, 1000)
}

function persistSession() {
  const session = {
    openFiles: tabs.map(t => ({ filePath: t.filePath, content: t.filePath ? undefined : t.content, type: t.type })),
    activeFile: activeTab()?.filePath || null,
    viewMode,
    openFolders: openFolders.map(f => ({ path: f.path, name: f.name, expanded: f.expanded, collapsed: f.collapsed }))
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
    editor && editor.refresh()
  })

  makeResizable(terminalResizeHandle, 'row', (delta) => {
    const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, terminalPanel.offsetHeight - delta))
    terminalPanel.style.height = newHeight + 'px'
    if (activeTerminalId !== null) {
      const t = terminals.get(activeTerminalId)
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
    editor && editor.refresh()
  })
}

// ─── Debounced saves ──────────────────────────────────────────────────────────
let settingsTimer = null
function saveSettingsDebounced() {
  clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => api.setSettings(settings), 400)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function iconForPath(name) {
  if (/\.json$/i.test(name)) return iconJSON()
  if (/\.(html?|jsx?)$/i.test(name)) return iconCode()
  if (/\.(ts|tsx)$/i.test(name)) return iconCode()
  if (/\.py$/i.test(name)) return iconCode()
  if (/\.ya?ml$/i.test(name)) return iconCode()
  if (/\.(sh|bash|zsh)$/i.test(name)) return iconCode()
  if (/\.txt$/i.test(name)) return iconText()
  if (/\.(md|markdown)$/i.test(name)) return iconMD()
  return iconFile()
}

function iconForType(type) {
  if (type === 'json') return iconJSON()
  if (type === 'markdown') return iconMD()
  if (type === 'text') return iconText()
  return iconCode()
}

function iconMD() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7.5V8.25L6 10l-1.5-1.75V11H3V5h1.5l1.5 2 1.5-2H9v6zm4-1.5l-1.5 1.5-1.5-1.5L11 9V5h1.5v4l.5-.5z"/></svg>`
}

function iconJSON() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.74 1c-.866 0-1.5.7-1.5 1.5v2c0 .55-.45 1-1 1H0v1h.24c.55 0 1 .45 1 1v2c0 .8.634 1.5 1.5 1.5H3.5v-1H2.74c-.3 0-.5-.2-.5-.5V8.5c0-.67-.38-1.25-.93-1.5.55-.25.93-.83.93-1.5v-2c0-.3.2-.5.5-.5H3.5V2H2.74zm10.52 0H12v1h.76c.3 0 .5.2.5.5v2c0 .67.38 1.25.93 1.5-.55.25-.93.83-.93 1.5v1.5c0 .3-.2.5-.5.5H12v1h1.26c.866 0 1.5-.7 1.5-1.5v-2c0-.55.45-1 1-1H16v-1h-.24c-.55 0-1-.45-1-1v-2C14.76 1.7 14.126 1 13.26 1zM6 6.5a.5.5 0 110 1 .5.5 0 010-1zM8 6.5a.5.5 0 110 1 .5.5 0 010-1zM10 6.5a.5.5 0 110 1 .5.5 0 010-1z"/></svg>`
}

function iconCode() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06L11.28 3.22z"/></svg>`
}

function iconText() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v1.5a.75.75 0 001.5 0V2.75A1.75 1.75 0 0014.25 1H1.75A1.75 1.75 0 000 2.75v1.5a.75.75 0 001.5 0V2.75zM7.25 7.5a.75.75 0 011.5 0v6a.75.75 0 01-1.5 0v-6z"/></svg>`
}

function iconFolder() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L5.75 1H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.5l1.75 2H14.25a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/></svg>`
}

function iconFile() {
  return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z"/></svg>`
}

// ─── Start ────────────────────────────────────────────────────────────────────
init()
