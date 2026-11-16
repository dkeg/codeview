/* globals api, FileTree, escHtml, Icons, openFile */
'use strict';

const PR_TTL_MS = 60 * 1000

window.GitManager = {
  statusCache: new Map(), // folderPath -> GitStatusResult
  prCache: new Map(),     // repo root  -> { at, result, loading }
  currentBranch: null,
  _refreshing: null,
  _lastFocusRefresh: 0,

  async getStatus(folderPath) {
    let result
    try { result = await window.api.getGitStatus(folderPath) } catch { result = null }
    if (result && result.success) {
      this.statusCache.set(folderPath, result)
    } else {
      this.statusCache.set(folderPath, { success: false, error: result && result.error, status: {}, changes: [] })
    }
    this.updateBranchDisplay()
    return result && result.success ? result.status : null
  },

  // Back-compat: branch now comes from the status call.
  async updateBranch(folderPath) {
    if (!this.statusCache.has(folderPath)) await this.getStatus(folderPath)
    this.updateBranchDisplay()
  },

  // Refresh statuses for every open folder. Concurrent calls are coalesced.
  refreshAll(opts = {}) {
    if (this._refreshing) {
      this._refreshQueued = { ...(this._refreshQueued || {}), ...opts }
      return this._refreshing
    }
    this._refreshing = (async () => {
      const folders = window.FileTree ? window.FileTree.openFolders : []
      const before = folders.map(f => JSON.stringify((this.statusCache.get(f.path) || {}).status || {}))
      await Promise.all(folders.map(f => this.getStatus(f.path)))
      const after = folders.map(f => JSON.stringify((this.statusCache.get(f.path) || {}).status || {}))
      // Only rebuild the file tree when decorations actually changed (avoids flicker on focus).
      if (opts.forceTree || before.some((b, i) => b !== after[i])) {
        window.FileTree.renderAllFolderSections()
      }
      if (this.isPanelVisible()) {
        this.renderPanel()
        this.loadPullRequests(!!opts.forcePRs)
      }
    })().finally(() => {
      this._refreshing = null
      if (this._refreshQueued) {
        const q = this._refreshQueued
        this._refreshQueued = null
        this.refreshAll(q)
      }
    })
    return this._refreshing
  },

  getFileStatus(folderPath, relativePath) {
    const cached = this.statusCache.get(folderPath)
    if (!cached || !cached.status) return null
    return cached.status[relativePath] || null
  },

  // Folder that owns the active tab (falls back to the first open folder).
  activeFolder() {
    const folders = window.FileTree ? window.FileTree.openFolders : []
    const tm = window.TabManager
    const tab = tm && tm.tabs && tm.tabs.find(t => t.id === tm.activeTabId)
    if (tab && tab.filePath) {
      const owner = folders
        .filter(f => tab.filePath.startsWith(f.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0]
      if (owner) return owner
    }
    return folders[0] || null
  },

  updateBranchDisplay() {
    const el = document.getElementById('git-branch-display')
    if (!el) return
    const folder = this.activeFolder()
    const st = folder && this.statusCache.get(folder.path)
    if (!st || !st.success || !st.branch) {
      el.style.display = 'none'
      this.currentBranch = null
      return
    }
    this.currentBranch = st.branch
    document.getElementById('git-branch-name').textContent = st.detached ? `(${st.branch})` : st.branch
    const sync = []
    if (st.ahead) sync.push(`↑${st.ahead}`)
    if (st.behind) sync.push(`↓${st.behind}`)
    document.getElementById('git-branch-sync').textContent = sync.length ? ' ' + sync.join(' ') : ''
    el.title = st.upstream ? `${st.branch} → ${st.upstream}` : `${st.branch} (no upstream)`
    el.style.display = 'flex'
  },

  // ─── Source Control panel ────────────────────────────────────────────────

  isPanelVisible() {
    const p = document.getElementById('panel-git')
    return !!(p && p.classList.contains('active') && window.sidebarVisible !== false)
  },

  onPanelShown() {
    this.renderPanel()
    this.refreshAll()
    this.loadPullRequests(false)
  },

  async loadPullRequests(force) {
    const roots = new Map() // root -> a folder path inside it
    for (const f of (window.FileTree ? window.FileTree.openFolders : [])) {
      const st = this.statusCache.get(f.path)
      if (st && st.success && st.root && !roots.has(st.root)) roots.set(st.root, f.path)
    }
    await Promise.all([...roots].map(async ([root, dir]) => {
      const c = this.prCache.get(root)
      if (c && c.loading) return
      if (!force && c && c.result && Date.now() - c.at < PR_TTL_MS) return
      this.prCache.set(root, { ...(c || {}), loading: true })
      this.renderPanel()
      let result
      try { result = await window.api.getPullRequests(dir) } catch (e) { result = { success: false, reason: 'error', error: String(e), prs: [] } }
      this.prCache.set(root, { at: Date.now(), result, loading: false })
      this.renderPanel()
    }))
  },

  renderPanel() {
    const container = document.getElementById('git-panel-content')
    if (!container) return
    const folders = window.FileTree ? window.FileTree.openFolders : []
    if (!folders.length) {
      container.innerHTML = '<div class="panel-empty">Open a folder to see git status</div>'
      return
    }

    const esc = window.escHtml
    const shownPRRoots = new Set()
    let html = ''

    for (const folder of folders) {
      const st = this.statusCache.get(folder.path)
      html += `<div class="git-repo">`
      if (!st) {
        html += `<div class="git-repo-header"><span class="git-repo-name">${esc(folder.name)}</span></div><div class="home-empty">Loading…</div></div>`
        continue
      }
      if (!st.success) {
        html += `<div class="git-repo-header"><span class="git-repo-name">${esc(folder.name)}</span></div><div class="home-empty">Not a git repository</div></div>`
        continue
      }

      const sync = (st.ahead ? ` <span class="git-sync">↑${st.ahead}</span>` : '') + (st.behind ? ` <span class="git-sync">↓${st.behind}</span>` : '')
      html += `<div class="git-repo-header" title="${esc(st.root)}">
          <span class="git-repo-name">${esc(folder.name)}</span>
          <span class="git-repo-branch">${esc(st.detached ? '(' + st.branch + ')' : st.branch || '')}${sync}</span>
        </div>`

      // Changes
      const changes = st.changes || []
      html += `<div class="home-label">Changes <span class="git-count">${changes.length}</span></div>`
      if (!changes.length) {
        html += `<div class="home-empty">Working tree clean</div>`
      } else {
        for (const c of changes) {
          const parts = c.path.split('/')
          const name = parts.pop()
          const dir = parts.join('/')
          const letter = this.letterFor(c)
          const staged = c.index !== '.' && c.index !== '?' ? ' staged' : ''
          html += `<div class="home-item git-change git-kind-${c.kind}${staged}" data-path="${esc(c.absPath)}" data-kind="${c.kind}" title="${esc(c.path)}${c.origPath ? ' (from ' + esc(c.origPath) + ')' : ''}${staged ? ' — staged' : ''}">
              <span class="home-item-icon">${window.Icons.iconForPath(name)}</span>
              <span class="home-item-name">${esc(name)}</span>
              ${dir ? `<span class="git-change-dir">${esc(dir)}</span>` : ''}
              <span class="git-badge">${letter}</span>
            </div>`
        }
      }

      // Pull requests — one list per repository, even if several of its folders are open
      if (!shownPRRoots.has(st.root)) {
        shownPRRoots.add(st.root)
        html += this.renderPRs(st)
      }
      html += `</div>`
    }

    container.innerHTML = html

    container.querySelectorAll('.git-change').forEach(el => {
      el.addEventListener('click', () => {
        const p = el.dataset.path
        if (el.dataset.kind === 'deleted') return
        if (window.FileTree.isEditableFile(p)) window.openFile(p)
        else window.api.showInFinder(p)
      })
    })
    container.querySelectorAll('[data-url]').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternal(el.dataset.url) })
    })
  },

  renderPRs(st) {
    const esc = window.escHtml
    const c = this.prCache.get(st.root)
    const r = c && c.result
    let html = `<div class="home-label">Pull Requests ${r && r.success ? `<span class="git-count">${r.prs.length}</span>` : ''}${c && c.loading ? ' <span class="git-loading">…</span>' : ''}</div>`
    if (!r) {
      return html + `<div class="home-empty">${c && c.loading ? 'Loading pull requests…' : ''}</div>`
    }
    if (!r.success) {
      return html + `<div class="home-empty git-pr-error">${esc(r.error || 'Could not load pull requests')}</div>`
    }

    const row = (pr, isCurrent) => {
      const badges = []
      if (isCurrent && pr.state && pr.state !== 'OPEN') badges.push(`<span class="git-pr-badge state-${pr.state.toLowerCase()}">${pr.state.toLowerCase()}</span>`)
      if (pr.isDraft) badges.push('<span class="git-pr-badge draft">draft</span>')
      if (pr.reviewDecision === 'APPROVED') badges.push('<span class="git-pr-badge approved">approved</span>')
      if (pr.reviewDecision === 'CHANGES_REQUESTED') badges.push('<span class="git-pr-badge changes">changes requested</span>')
      if (pr.checks) badges.push(`<span class="git-pr-badge checks-${pr.checks}">checks ${pr.checks}</span>`)
      return `<a class="git-pr${isCurrent ? ' current' : ''}" href="#" data-url="${esc(pr.url)}" title="Open #${pr.number} on GitHub">
          <div class="git-pr-title"><span class="git-pr-num">#${pr.number}</span> ${esc(pr.title)}</div>
          <div class="git-pr-meta">${esc(pr.headRefName)} · ${esc((pr.author && pr.author.login) || '')}${badges.length ? ' ' + badges.join(' ') : ''}</div>
        </a>`
    }

    if (r.current) {
      html += `<div class="git-pr-section">This branch</div>` + row(r.current, true)
    }
    const others = r.prs.filter(p => !r.current || p.number !== r.current.number)
    if (r.current && others.length) html += `<div class="git-pr-section">Open</div>`
    if (!others.length && !r.current) html += `<div class="home-empty">No open pull requests</div>`
    for (const pr of others) html += row(pr, false)
    return html
  },

  letterFor(c) {
    switch (c.kind) {
      case 'untracked': return 'U'
      case 'added': return 'A'
      case 'deleted': return 'D'
      case 'renamed': return 'R'
      case 'conflict': return '!'
      default: return 'M'
    }
  }
};

// Refresh git status when the window regains focus (throttled).
window.addEventListener('focus', () => {
  const gm = window.GitManager
  if (!gm || Date.now() - gm._lastFocusRefresh < 2000) return
  gm._lastFocusRefresh = Date.now()
  gm.refreshAll()
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('git-refresh')
  if (btn) btn.addEventListener('click', () => window.GitManager.refreshAll({ forcePRs: true, forceTree: true }))
});
