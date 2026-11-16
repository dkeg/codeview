/* globals Icons, escHtml, updateToolbarTitle, updateSplashScreen, saveSessionDebounced, api, loadTabIntoEditor, tabsList */
'use strict';

window.TabManager = {
  tabs: [],
  activeTabId: null,
  nextTabId: 1,

  activeTab() {
    return this.tabs.find(t => t.id === this.activeTabId) || null
  },

  createTab(filePath, content, type) {
    if (filePath) {
      const existing = this.tabs.find(t => t.filePath === filePath)
      if (existing) { this.switchTab(existing.id); return existing }
    }
    const id = this.nextTabId++
    const name = filePath ? filePath.split('/').pop() : 'Untitled'
    const tab = { id, filePath, name, content: content || '', type: type || 'markdown', modified: false }
    this.tabs.push(tab)
    this.switchTab(id)
    return tab
  },

  switchTab(id) {
    const tab = this.tabs.find(t => t.id === id)
    if (!tab) return
    this.activeTabId = id
    this.renderTabs()
    window.loadTabIntoEditor(tab)
    window.updateToolbarTitle()
    window.updateSplashScreen()
    window.saveSessionDebounced()
  },

  async closeTab(id) {
    const tab = this.tabs.find(t => t.id === id)
    if (!tab) return

    if (tab.modified) {
      // Native Save / Don't Save / Cancel sheet (WKWebView has no window.confirm)
      const choice = await window.api.askSaveChanges(tab.name)
      if (choice === 'cancel') return
      if (choice === 'save') {
        if (tab.filePath) {
          const result = await window.api.writeFile(tab.filePath, tab.content)
          if (!result || !result.success) {
            window.api.showMessage('Save failed: ' + ((result && result.error) || 'unknown error'))
            return
          }
        } else {
          // Untitled: switch to it and run Save As; keep it open if cancelled.
          this.switchTab(tab.id)
          await window.saveAsCurrentTab()
          if (tab.modified) return
        }
        if (window.GitManager) window.GitManager.refreshAll()
      }
    }
    if (!this.tabs.includes(tab)) return

    const idx = this.tabs.indexOf(tab)
    this.tabs.splice(idx, 1)

    if (this.activeTabId === id) {
      const next = this.tabs[idx] || this.tabs[idx - 1] || null
      this.activeTabId = next ? next.id : null
      if (next) {
        window.loadTabIntoEditor(next)
      } else {
        if (window.editor) window.editor.setValue('')
        const nameEl = document.getElementById('file-name-display')
        if (nameEl) nameEl.textContent = ''
        const modEl = document.getElementById('modified-indicator')
        if (modEl) modEl.style.display = 'none'
        window.updatePreview()
      }
    }

    this.renderTabs()
    window.updateToolbarTitle()
    window.updateSplashScreen()
    window.saveSessionDebounced()
  },

  renderTabs() {
    if (this.tabs.length === 0) {
      window.tabsList.innerHTML = '<div class="tabs-empty">No open files</div>'
      return
    }
    window.tabsList.innerHTML = ''
    this.tabs.forEach(tab => {
      const el = document.createElement('div')
      const isActive = tab.id === this.activeTabId
      el.className = 'tab' + (isActive ? ' active' : '')
      el.dataset.id = tab.id
      
      const dotClass = tab.modified ? 'dot-modified' : isActive ? 'dot-active' : 'dot-inactive'

      el.innerHTML = `
        <span class="tab-icon">${window.Icons.iconForType(tab.type)}</span>
        <span class="tab-name">${window.escHtml(tab.name)}</span>
        <span class="tab-status-dot ${dotClass}"></span>
        <button class="tab-close" title="Close">
          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      `
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return
        window.splashLocked = false
        this.switchTab(tab.id)
      })
      el.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation()
        this.closeTab(tab.id)
      })
      window.tabsList.appendChild(el)
    })
  }
};
