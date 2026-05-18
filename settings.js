/* globals api, settings:true, applyTheme, applyEditorSettings, saveSettingsDebounced, settingsOverlay, $ */
'use strict';

window.SettingsManager = {
  openSettings() {
    window.settingsOverlay.style.display = 'flex'

    // Editor tab
    window.$('setting-font-family').value = window.settings.fontFamily || "'SF Mono', monospace"
    window.$('setting-font-size').value = window.settings.fontSize || 14
    window.$('font-size-display').textContent = (window.settings.fontSize || 14) + 'px'
    window.$('setting-side-margin').value = window.settings.sideMargin || 24
    window.$('side-margin-display').textContent = (window.settings.sideMargin || 24) + 'px'
    window.$('setting-tb-margin').value = window.settings.tbMargin || 16
    window.$('tb-margin-display').textContent = (window.settings.tbMargin || 16) + 'px'
    window.$('setting-line-numbers').checked = window.settings.lineNumbers !== false
    window.$('setting-sync-scroll').checked = window.settings.syncScroll !== false

    // Terminal tab
    window.$('setting-term-font-family').value = window.settings.termFontFamily || "'SF Mono', monospace"
    window.$('setting-term-font-size').value = window.settings.termFontSize || 13
    window.$('term-font-size-display').textContent = (window.settings.termFontSize || 13) + 'px'
    window.$('setting-term-padding').value = window.settings.termPadding || 8
    window.$('term-padding-display').textContent = (window.settings.termPadding || 8) + 'px'
    window.$('setting-term-line-height').value = (window.settings.termLineHeight || 14)
    window.$('term-line-height-display').textContent = ((window.settings.termLineHeight || 14) / 10).toFixed(1)
    window.$('setting-term-letter-spacing').value = window.settings.termLetterSpacing || 0
    window.$('term-letter-spacing-display').textContent = (window.settings.termLetterSpacing || 0) + 'px'
    window.$('setting-term-cursor').value = window.settings.termCursorStyle || 'block'
    window.$('setting-term-theme').value = window.settings.termTheme || 'apple-dark'

    // General tab
    window.$('setting-theme').value = window.settings.theme || 'system'
    window.$('setting-restore-session').checked = window.settings.restoreSession !== false

    window.$('setting-editor-theme').value = window.settings.editorTheme || 'default'
  },

  bindSettingsModal() {
    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'))
        document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'))
        tab.classList.add('active')
        window.$('settings-panel-' + tab.dataset.tab).classList.add('active')
      })
    })

    window.$('settings-close').addEventListener('click', this.closeSettings)
    window.settingsOverlay.addEventListener('click', (e) => { if (e.target === window.settingsOverlay) this.closeSettings() })

    // Editor settings
    window.$('setting-font-family').addEventListener('change', (e) => {
      window.settings.fontFamily = e.target.value
      window.applyEditorSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-font-size').addEventListener('input', (e) => {
      window.settings.fontSize = parseInt(e.target.value, 10)
      window.$('font-size-display').textContent = window.settings.fontSize + 'px'
      window.applyEditorSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-side-margin').addEventListener('input', (e) => {
      window.settings.sideMargin = parseInt(e.target.value, 10)
      window.$('side-margin-display').textContent = window.settings.sideMargin + 'px'
      window.applyEditorSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-tb-margin').addEventListener('input', (e) => {
      window.settings.tbMargin = parseInt(e.target.value, 10)
      window.$('tb-margin-display').textContent = window.settings.tbMargin + 'px'
      window.applyEditorSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-line-numbers').addEventListener('change', (e) => {
      window.settings.lineNumbers = e.target.checked
      window.applyEditorSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-sync-scroll').addEventListener('change', (e) => {
      window.settings.syncScroll = e.target.checked
      window.syncScrollActive = e.target.checked
      document.getElementById('btn-sync-scroll').classList.toggle('active', window.syncScrollActive)
      window.saveSettingsDebounced()
    })
    window.$('setting-editor-theme').addEventListener('change', (e) => {
      window.settings.editorTheme = e.target.value
      window.applyEditorSettings()
      window.saveSettingsDebounced()
    })

    // Terminal settings
    window.$('setting-term-font-family').addEventListener('change', (e) => {
      window.settings.termFontFamily = e.target.value
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-term-font-size').addEventListener('input', (e) => {
      window.settings.termFontSize = parseInt(e.target.value, 10)
      window.$('term-font-size-display').textContent = window.settings.termFontSize + 'px'
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-term-padding').addEventListener('input', (e) => {
      window.settings.termPadding = parseInt(e.target.value, 10)
      window.$('term-padding-display').textContent = window.settings.termPadding + 'px'
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-term-line-height').addEventListener('input', (e) => {
      window.settings.termLineHeight = parseInt(e.target.value, 10)
      window.$('term-line-height-display').textContent = (window.settings.termLineHeight / 10).toFixed(1)
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-term-letter-spacing').addEventListener('input', (e) => {
      window.settings.termLetterSpacing = parseInt(e.target.value, 10)
      window.$('term-letter-spacing-display').textContent = window.settings.termLetterSpacing + 'px'
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-term-cursor').addEventListener('change', (e) => {
      window.settings.termCursorStyle = e.target.value
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })
    window.$('setting-term-theme').addEventListener('change', (e) => {
      window.settings.termTheme = e.target.value
      window.applyTerminalSettings()
      window.saveSettingsDebounced()
    })

    // General settings
    window.$('setting-theme').addEventListener('change', (e) => {
      window.settings.theme = e.target.value
      window.applyTheme()
      window.saveSettingsDebounced()
    })
    window.$('setting-restore-session').addEventListener('change', (e) => {
      window.settings.restoreSession = e.target.checked
      window.saveSettingsDebounced()
    })

    // Terminal panel buttons
    window.$('btn-terminal-new').addEventListener('click', () => window.createTerminalSession())
    window.$('btn-terminal-maximize').addEventListener('click', window.toggleTerminalMaximize)
    window.$('btn-terminal-close').addEventListener('click', window.toggleTerminal)
  },

  closeSettings() {
    window.settingsOverlay.style.display = 'none'
  }
};
