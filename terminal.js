/* globals api, settings, terminalPanel, terminalTabs, terminalSessions, terminalResizeHandle, openFolders, updateSplashScreen, editor, activeTerminalId:true, terminalVisible:true, terminalMaximized:true, Terminal, FitAddon, WebLinksAddon */
'use strict';

// Terminal state
window.terminals = new Map();   // id -> { xterm, fitAddon, sessionEl, tabEl, termId }
window.activeTerminalId = null;
window.nextTermId = 1;
window.terminalVisible = false;
window.terminalMaximized = false;

const TERMINAL_BASE = {
  background: '#0d0d0f',
  foreground: '#f2f2f7',
  cursor: '#0A84FF',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(10,132,255,0.3)'
};

const TERMINAL_THEMES = {
  'apple-dark': {
    black: '#1c1c1e', brightBlack: '#636366',
    red: '#FF453A', brightRed: '#FF6961',
    green: '#32D74B', brightGreen: '#30DB5B',
    yellow: '#FFD60A', brightYellow: '#FFD426',
    blue: '#0A84FF', brightBlue: '#409CFF',
    magenta: '#BF5AF2', brightMagenta: '#DA8FFF',
    cyan: '#5AC8FA', brightCyan: '#70D7FF',
    white: '#EBEBF5', brightWhite: '#FFFFFF'
  },
  'kaku': {
    black: '#181926', brightBlack: '#585b70',
    red: '#f38ba8', brightRed: '#f38ba8',
    green: '#a6e3a1', brightGreen: '#a6e3a1',
    yellow: '#f9e2af', brightYellow: '#f9e2af',
    blue: '#89b4fa', brightBlue: '#89b4fa',
    magenta: '#cba6f7', brightMagenta: '#cba6f7',
    cyan: '#89dceb', brightCyan: '#89dceb',
    white: '#bac2de', brightWhite: '#cdd6f4'
  },
  'dracula': {
    black: '#21222c', brightBlack: '#6272a4',
    red: '#ff5555', brightRed: '#ff6e6e',
    green: '#50fa7b', brightGreen: '#69ff94',
    yellow: '#f1fa8c', brightYellow: '#ffffa5',
    blue: '#bd93f9', brightBlue: '#d6acff',
    magenta: '#ff79c6', brightMagenta: '#ff92df',
    cyan: '#8be9fd', brightCyan: '#a4ffff',
    white: '#f8f8f2', brightWhite: '#ffffff'
  },
  'nord': {
    black: '#3b4252', brightBlack: '#4c566a',
    red: '#bf616a', brightRed: '#bf616a',
    green: '#a3be8c', brightGreen: '#a3be8c',
    yellow: '#ebcb8b', brightYellow: '#ebcb8b',
    blue: '#81a1c1', brightBlue: '#88c0d0',
    magenta: '#b48ead', brightMagenta: '#b48ead',
    cyan: '#88c0d0', brightCyan: '#8fbcbb',
    white: '#e5e9f0', brightWhite: '#eceff4'
  },
  'solarized-dark': {
    black: '#073642', brightBlack: '#586e75',
    red: '#dc322f', brightRed: '#cb4b16',
    green: '#859900', brightGreen: '#657b83',
    yellow: '#b58900', brightYellow: '#b58900',
    blue: '#268bd2', brightBlue: '#839496',
    magenta: '#d33682', brightMagenta: '#6c71c4',
    cyan: '#2aa198', brightCyan: '#93a1a1',
    white: '#eee8d5', brightWhite: '#fdf6e3'
  },
  'one-dark': {
    black: '#3f4451', brightBlack: '#4f5666',
    red: '#e06c75', brightRed: '#ff7b86',
    green: '#98c379', brightGreen: '#b1e18b',
    yellow: '#e5c07b', brightYellow: '#ffd993',
    blue: '#61afef', brightBlue: '#67cdff',
    magenta: '#c678dd', brightMagenta: '#de9dff',
    cyan: '#56b6c2', brightCyan: '#63d4e0',
    white: '#abb2bf', brightWhite: '#ffffff'
  }
};

window.getTerminalTheme = function() {
  const ansi = TERMINAL_THEMES[window.settings.termTheme || 'apple-dark'] || TERMINAL_THEMES['apple-dark']
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--editor-bg').trim() || TERMINAL_BASE.background
  return { ...TERMINAL_BASE, background: bg, ...ansi }
};

window.applyTerminalSettings = function() {
  const pad = (window.settings.termPadding || 8) + 'px'
  document.documentElement.style.setProperty('--term-padding', pad)

  const ff = window.settings.termFontFamily || "'SF Mono', monospace"
  const fs = window.settings.termFontSize || 13
  const lh = (window.settings.termLineHeight || 14) / 10
  const ls = window.settings.termLetterSpacing || 0
  const cursor = window.settings.termCursorStyle || 'block'
  const theme = window.getTerminalTheme()

  window.terminals.forEach(({ xterm, fitAddon }) => {
    if (!xterm) return
    xterm.options.fontFamily = ff
    xterm.options.fontSize = fs
    xterm.options.lineHeight = lh
    xterm.options.letterSpacing = ls
    xterm.options.cursorStyle = cursor
    xterm.options.theme = theme
    if (fitAddon) fitAddon.fit()
  })
};

window.openTerminal = async function(cwd, startMaximized = false) {
  if (!window.terminalVisible) {
    window.terminalVisible = true
    window.terminalPanel.style.display = 'flex'
    window.terminalResizeHandle.style.display = ''
    document.getElementById('btn-toggle-terminal').classList.add('active')
    window.updateSplashScreen()
  }

  if (window.terminals.size === 0) {
    await window.createTerminalSession(cwd)
    if (startMaximized) {
      window.terminalMaximized = true
      window.terminalPanel.classList.add('maximized')
      window.updateMaximizeIcon()
      const t = window.terminals.get(window.activeTerminalId)
      if (t) requestAnimationFrame(() => t.fitAddon.fit())
    }
    return
  }

  if (window.activeTerminalId !== null) {
    const t = window.terminals.get(window.activeTerminalId)
    if (t) t.fitAddon.fit()
  }
};

window.createTerminalSession = async function(cwd) {
  const id = window.nextTermId++
  const openCwd = cwd || (window.FileTree.openFolders.length > 0 ? window.FileTree.openFolders[0].path : null)

  const sessionEl = document.createElement('div')
  sessionEl.className = 'term-session active'
  sessionEl.id = 'term-session-' + id
  window.terminalSessions.appendChild(sessionEl)

  // Deactivate any currently active session while we set up
  window.terminals.forEach(({ sessionEl: el, tabEl }) => {
    el.classList.remove('active')
    tabEl.classList.remove('active')
  })

  const ff = window.settings.termFontFamily || "'SF Mono', monospace"
  const fs = window.settings.termFontSize || 13
  const lh = (window.settings.termLineHeight || 14) / 10
  const ls = window.settings.termLetterSpacing || 0
  const cursor = window.settings.termCursorStyle || 'block'

  const xterm = new window.Terminal({
    fontFamily: ff,
    fontSize: fs,
    lineHeight: lh,
    letterSpacing: ls,
    cursorStyle: cursor,
    cursorBlink: true,
    theme: window.getTerminalTheme(),
    allowTransparency: true
  })

  const fitAddon = new window.FitAddon.FitAddon()
  const webLinksAddon = new window.WebLinksAddon.WebLinksAddon((e, uri) => window.api.openExternal(uri))
  xterm.loadAddon(fitAddon)
  xterm.loadAddon(webLinksAddon)
  xterm.open(sessionEl)
  await new Promise(r => requestAnimationFrame(r))
  fitAddon.fit()

  const termId = await window.api.terminal.create(openCwd)

  window.api.terminal.onOutput((evtId, data) => {
    if (evtId !== termId) return
    // Intercept magic open commands from mview shell function
    const magic = data.match(/__CV_OPEN__:([^:]+):([^\r\n]+)/)
    if (magic) {
      const mode = magic[1]
      const filePath = magic[2].trim()
      // openFile is global in renderer.js
      window.openFile(filePath, mode)
      return
    }
    xterm.write(data)
  })

  window.api.terminal.onExit((evtId) => {
    if (evtId !== termId) return
    window.closeTerminalSession(id)
  })

  xterm.onData(data => window.api.terminal.input(termId, data))

  xterm.onResize(({ cols, rows }) => window.api.terminal.resize(termId, cols, rows))

  const initialTabName = openCwd ? openCwd.split('/').filter(Boolean).pop() : 'shell'

  const tabEl = document.createElement('div')
  tabEl.className = 'term-tab'
  tabEl.dataset.id = id
  tabEl.innerHTML = `
    <span class="term-tab-dot"></span>
    <span class="term-tab-label">${initialTabName}</span>
    <span class="term-tab-close">
      <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
      </svg>
    </span>
  `

  xterm.onTitleChange(title => {
    if (!title) return
    // Clean up title: handle paths like ~/projects/app or /usr/bin
    // Many shells send the current path or even "user@host: path"
    let cleanTitle = title.split(':').pop().trim() // handle "user@host: path"
    cleanTitle = cleanTitle.split('/').filter(Boolean).pop() || cleanTitle
    if (cleanTitle) tabEl.querySelector('.term-tab-label').textContent = cleanTitle
  })

  tabEl.addEventListener('click', (e) => {
    if (e.target.closest('.term-tab-close')) return
    window.switchTerminalSession(id)
  })
  tabEl.querySelector('.term-tab-close').addEventListener('click', (e) => {
    e.stopPropagation()
    window.closeTerminalSession(id)
  })
  const newBtn = document.getElementById('btn-terminal-new')
  window.terminalTabs.insertBefore(tabEl, newBtn)

  window.terminals.set(id, { xterm, fitAddon, sessionEl, tabEl, termId })
  window.switchTerminalSession(id)
};

window.switchTerminalSession = function(id) {
  window.terminals.forEach(({ sessionEl, tabEl }, tid) => {
    const active = tid === id
    sessionEl.classList.toggle('active', active)
    tabEl.classList.toggle('active', active)
  })
  window.activeTerminalId = id
  const t = window.terminals.get(id)
  if (t) {
    requestAnimationFrame(() => {
      t.fitAddon.fit()
      t.xterm.focus()
    })
  }
};

window.closeTerminalSession = function(id) {
  const t = window.terminals.get(id)
  if (!t) return
  window.api.terminal.kill(t.termId)
  t.xterm.dispose()
  t.sessionEl.remove()
  t.tabEl.remove()
  window.terminals.delete(id)

  if (window.terminals.size === 0) {
    window.hideTerminal()
  } else if (window.activeTerminalId === id) {
    const firstId = window.terminals.keys().next().value
    window.switchTerminalSession(firstId)
  }
};

window.hideTerminal = function() {
  window.terminalVisible = false
  window.terminalMaximized = false
  window.terminalPanel.style.display = 'none'
  window.terminalPanel.classList.remove('maximized')
  window.terminalResizeHandle.style.display = 'none'
  document.getElementById('btn-toggle-terminal').classList.remove('active')
  window.updateMaximizeIcon()
  if (window.editor) window.editor.refresh()
  window.updateSplashScreen()
};

window.toggleTerminal = function() {
  if (window.terminalVisible) {
    window.hideTerminal()
  } else {
    window.openTerminal()
  }
};

window.updateMaximizeIcon = function() {
  const btn = document.getElementById('btn-terminal-maximize')
  if (window.terminalMaximized) {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.75 2.5a.75.75 0 000 1.5h2.19l-5 5H.75a.75.75 0 000 1.5h2.69l5-5v2.19a.75.75 0 001.5 0V2.5h-4.19zm4.5 11a.75.75 0 000-1.5H8.06l5-5h2.19a.75.75 0 000-1.5h-2.69l-5 5V8.06a.75.75 0 00-1.5 0v4.44h4.19z"/>
    </svg>`
    btn.title = 'Restore Terminal'
  } else {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V2.75A1.75 1.75 0 0014.25 1H1.75zM1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v10.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/>
    </svg>`
    btn.title = 'Maximize Terminal'
  }
};

window.toggleTerminalMaximize = function() {
  window.terminalMaximized = !window.terminalMaximized
  window.terminalPanel.classList.toggle('maximized', window.terminalMaximized)
  window.updateMaximizeIcon()
  if (window.activeTerminalId !== null) {
    const t = window.terminals.get(window.activeTerminalId)
    if (t) requestAnimationFrame(() => t.fitAddon.fit())
  }
};
