/* Wails bridge — provides the same window.api surface the Electron preload did. */
'use strict';

(() => {
  const runtime = import('/wails/runtime.js')
  const call = (method, ...args) =>
    runtime.then(rt => rt.Call.ByName('main.CodeView.' + method, ...args))

  // Subscribe to a backend event; returns an unsubscribe fn synchronously.
  function listen(name, handler) {
    let off = null
    let cancelled = false
    runtime.then(rt => {
      if (!cancelled) off = rt.Events.On(name, ev => handler(ev.data))
    })
    return () => { cancelled = true; if (off) off() }
  }

  // ─── Markdown (was done with Node require() in preload.js) ────────────────
  if (window.marked && window.hljs) {
    window.marked.use({
      gfm: true,
      breaks: false,
      headerIds: true,
      mangle: false,
      renderer: {
        code(code, language) {
          const lang = language && window.hljs.getLanguage(language) ? language : null
          try {
            const value = lang
              ? window.hljs.highlight(code, { language: lang }).value
              : window.hljs.highlightAuto(code).value
            return `<pre><code class="hljs${lang ? ` language-${lang}` : ''}">${value}</code></pre>\n`
          } catch {
            return false
          }
        }
      }
    })
  }

  // ─── Terminal input: keep keystrokes ordered and coalesce bursts ──────────
  const inputQueues = new Map() // id -> { buf, inflight }
  function sendInput(id, data) {
    let q = inputQueues.get(id)
    if (!q) { q = { buf: '', inflight: false }; inputQueues.set(id, q) }
    q.buf += data
    if (q.inflight) return
    const flush = () => {
      if (!q.buf) { q.inflight = false; return }
      const chunk = q.buf
      q.buf = ''
      q.inflight = true
      call('TerminalInput', id, chunk).catch(() => {}).finally(flush)
    }
    flush()
  }

  const allowedChannels = new Set([
    'open-external-file', 'theme-updated', 'open-settings',
    'menu-new-file', 'menu-open-file', 'menu-open-folder', 'menu-save',
    'menu-save-as', 'menu-close-tab', 'menu-view-mode', 'menu-cycle-view',
    'menu-toggle-sidebar', 'menu-toggle-terminal', 'menu-show-git'
  ])

  window.api = {
    // File operations
    readFile: (p) => call('ReadFile', p),
    writeFile: (p, content) => call('WriteFile', p, content),
    showOpenDialog: () => call('ShowOpenDialog').then(p => p || null),
    showFolderDialog: () => call('ShowFolderDialog').then(p => p || null),
    showSaveDialog: (name) => call('ShowSaveDialog', name || '').then(p => p || null),
    readDir: (p) => call('ReadDir', p),

    // Settings & session
    getSettings: () => call('GetSettings'),
    setSettings: (s) => call('SetSettings', s),
    getSession: () => call('GetSession'),
    saveSession: (s) => call('SaveSession', s),

    getTheme: () => call('GetTheme'),
    trafficLightsInset: () => call('TrafficLightsInset'),

    // Git & GitHub
    getGitStatus: (dir) => call('GetGitStatus', dir),
    getGitBranch: (dir) => call('GetGitBranch', dir),
    getPullRequests: (dir) => call('GetPullRequests', dir),

    // Utility
    showInFinder: (p) => call('ShowInFinder', p),
    setTitle: (t) => call('SetTitle', t),
    openExternal: (url) => call('OpenExternal', url),
    getHomeDir: () => call('GetHomeDir'),
    checkForUpdates: () => call('CheckForUpdates'),

    // Native dialogs (WKWebView has no window.alert/confirm)
    showMessage: (message, title) => call('ShowMessage', title || 'CodeView', String(message)),
    askSaveChanges: (name) => call('AskSaveChanges', name),

    renderMarkdown: (content) => {
      try {
        return window.marked.parse(content || '')
      } catch (e) {
        console.error('Markdown rendering error:', e)
        return content
      }
    },

    terminal: {
      create: (cwd, cols, rows) => call('TerminalCreate', cwd || '', cols || 80, rows || 24),
      input: (id, data) => sendInput(id, data),
      resize: (id, cols, rows) => { call('TerminalResize', id, cols, rows).catch(() => {}) },
      kill: (id) => { inputQueues.delete(id); return call('TerminalKill', id) },
      onOutput: (cb) => listen('terminal-output', d => cb(d.id, d.data)),
      onExit: (cb) => listen('terminal-exit', id => { inputQueues.delete(id); cb(id) })
    },

    on: (channel, callback) => {
      if (!allowedChannels.has(channel)) return
      const off = listen(channel, data => (data === undefined || data === null) ? callback() : callback(data))
      if (channel === 'open-external-file') {
        // Deliver files Finder asked us to open before the UI was listening.
        runtime.then(() => call('FrontendReady')).then(files => (files || []).forEach(f => callback(f)))
      }
      return off
    }
  }

  window.alert = (msg) => { window.api.showMessage(msg) }

  // Keep toolbar controls clear of the traffic lights.
  const applyInset = () => window.api.trafficLightsInset().then(x => {
    if (x > 0) document.documentElement.style.setProperty('--traffic-lights-inset', Math.ceil(x + 14) + 'px')
  }).catch(() => {})
  window.addEventListener('DOMContentLoaded', () => { applyInset(); setTimeout(applyInset, 1000) })
})()
