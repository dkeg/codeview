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
    const tab = { id, filePath, name, content: content || '', type: type || 'markdown', modified: !filePath }
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

  closeTab(id) {
    const tab = this.tabs.find(t => t.id === id)
    if (!tab) return

    if (tab.modified) {
      if (!confirm(`Save changes to "${tab.name}" before closing?`)) return
      if (tab.filePath) window.api.writeFile(tab.filePath, tab.content)
    }

    const idx = this.tabs.indexOf(tab)
    this.tabs.splice(idx, 1)

    if (this.activeTabId === id) {
      const next = this.tabs[idx] || this.tabs[idx - 1] || null
      this.activeTabId = next ? next.id : null
      if (next) {
        window.loadTabIntoEditor(next)
      } else {
        if (window.editor) window.editor.setValue('')
        document.getElementById('file-name-display').textContent = ''
        document.getElementById('modified-indicator').style.display = 'none'
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
      el.className = 'tab' + (tab.id === this.activeTabId ? ' active' : '') + (tab.modified ? ' modified' : '')
      el.dataset.id = tab.id
      el.innerHTML = `
        <span class="tab-icon">${window.Icons.iconForType(tab.type)}</span>
        <span class="tab-name">${window.escHtml(tab.name)}</span>
        <span class="tab-modified"></span>
        <button class="tab-close" title="Close">
          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      `
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return
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
