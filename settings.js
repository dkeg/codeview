/* globals api, settings:true, applyTheme, applyEditorSettings, saveSettingsDebounced, settingsOverlay, $ */
'use strict';

window.SettingsManager = {
  openSettings() {
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
    $('setting-term-theme').value = settings.termTheme || 'apple-dark'

    // General tab
    $('setting-theme').value = settings.theme || 'system'
    $('setting-restore-session').checked = settings.restoreSession !== false

    $('setting-editor-theme').value = settings.editorTheme || 'default'
  },

  bindSettingsModal() {
    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'))
        document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'))
        tab.classList.add('active')
        $('settings-panel-' + tab.dataset.tab).classList.add('active')
      })
    })

    $('settings-close').addEventListener('click', this.closeSettings)
    settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) this.closeSettings() })

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
      // syncScrollActive is global in renderer.js
      window.syncScrollActive = e.target.checked
      document.getElementById('btn-sync-scroll').classList.toggle('active', window.syncScrollActive)
      saveSettingsDebounced()
    })
    $('setting-editor-theme').addEventListener('change', (e) => {
      settings.editorTheme = e.target.value
      applyEditorSettings()
      saveSettingsDebounced()
    })

    // Terminal settings
    $('setting-term-font-family').addEventListener('change', (e) => {
      settings.termFontFamily = e.target.value
      window.applyTerminalSettings()
      saveSettingsDebounced()
    })
    $('setting-term-font-size').addEventListener('input', (e) => {
      settings.termFontSize = parseInt(e.target.value, 10)
      $('term-font-size-display').textContent = settings.termFontSize + 'px'
      window.applyTerminalSettings()
      saveSettingsDebounced()
    })
    $('setting-term-padding').addEventListener('input', (e) => {
      settings.termPadding = parseInt(e.target.value, 10)
      $('term-padding-display').textContent = settings.termPadding + 'px'
      window.applyTerminalSettings()
      saveSettingsDebounced()
    })
    $('setting-term-line-height').addEventListener('input', (e) => {
      settings.termLineHeight = parseInt(e.target.value, 10)
      $('term-line-height-display').textContent = (settings.termLineHeight / 10).toFixed(1)
      window.applyTerminalSettings()
      saveSettingsDebounced()
    })
    $('setting-term-letter-spacing').addEventListener('input', (e) => {
      settings.termLetterSpacing = parseInt(e.target.value, 10)
      $('term-letter-spacing-display').textContent = settings.termLetterSpacing + 'px'
      window.applyTerminalSettings()
      saveSettingsDebounced()
    })
    $('setting-term-cursor').addEventListener('change', (e) => {
      settings.termCursorStyle = e.target.value
      window.applyTerminalSettings()
      saveSettingsDebounced()
    })
    $('setting-term-theme').addEventListener('change', (e) => {
      settings.termTheme = e.target.value
      window.applyTerminalSettings()
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
    $('btn-terminal-new').addEventListener('click', () => window.createTerminalSession())
    $('btn-terminal-maximize').addEventListener('click', window.toggleTerminalMaximize)
    $('btn-terminal-close').addEventListener('click', window.toggleTerminal)
  },

  closeSettings() {
    settingsOverlay.style.display = 'none'
  }
};
