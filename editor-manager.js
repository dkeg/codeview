/* globals CodeMirror, settings, activeTab, renderTabs, updateToolbarTitle, updatePreview, syncScrollActive, isSyncScrolling:true, previewPanel */
'use strict';

window.EditorManager = {
  editor: null,

  initEditor() {
    const textarea = document.getElementById('editor-textarea')
    this.editor = CodeMirror.fromTextArea(textarea, {
      mode: 'markdown',
      theme: window.settings.editorTheme || 'default',
      lineNumbers: window.settings.lineNumbers !== false,
      lineWrapping: true,
      autofocus: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      extraKeys: {
        'Cmd-S': () => window.saveCurrentTab(),
        'Ctrl-S': () => window.saveCurrentTab()
      }
    })

    this.editor.on('change', () => {
      const tab = window.activeTab()
      if (!tab) return
      tab.content = this.editor.getValue()
      if (!tab.modified) {
        tab.modified = true
        window.renderTabs()
        window.updateToolbarTitle()
      }
      window.updatePreview()
    })

    this.editor.on('scroll', () => {
      if (!window.syncScrollActive || window.isSyncScrolling) return
      window.isSyncScrolling = true
      const info = this.editor.getScrollInfo()
      const ratio = info.top / (info.height - info.clientHeight)
      const previewMax = window.previewPanel.scrollHeight - window.previewPanel.clientHeight
      window.previewPanel.scrollTop = ratio * previewMax
      requestAnimationFrame(() => { window.isSyncScrolling = false })
    })

    this.applyEditorSettings()
  },

  getEditorMode(type) {
    switch (type) {
      case 'json':       return { name: 'javascript', json: true }
      case 'html':       return 'htmlmixed'
      case 'javascript': return 'javascript'
      case 'python':     return 'python'
      case 'yaml':       return 'yaml'
      case 'shell':      return 'shell'
      default:           return 'markdown'
    }
  },

  applyEditorSettings() {
    const ff = window.settings.fontFamily || "'SF Mono', monospace"
    const fs = (window.settings.fontSize || 14) + 'px'
    const sm = (window.settings.sideMargin || 24) + 'px'
    const tbm = (window.settings.tbMargin || 16) + 'px'
    document.documentElement.style.setProperty('--editor-font-family', ff)
    document.documentElement.style.setProperty('--editor-font-size', fs)
    document.documentElement.style.setProperty('--editor-side-margin', sm)
    document.documentElement.style.setProperty('--editor-tb-margin', tbm)

    if (this.editor) {
      this.editor.setOption('lineNumbers', window.settings.lineNumbers !== false)
      this.editor.setOption('theme', window.settings.editorTheme || 'default')
      this.editor.refresh()
    }

    window.syncScrollActive = window.settings.syncScroll !== false
    const syncBtn = document.getElementById('btn-sync-scroll')
    if (syncBtn) syncBtn.classList.toggle('active', window.syncScrollActive)
  },

  loadTabIntoEditor(tab) {
    if (!this.editor) return
    this.editor.setOption('mode', this.getEditorMode(tab.type))
    this.editor.setValue(tab.content)
    this.editor.clearHistory()
    this.editor.focus()
    window.updatePreview()
  }
};
