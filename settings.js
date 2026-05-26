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

    const settingsClose = window.$('settings-close')
    if (settingsClose) settingsClose.addEventListener('click', this.closeSettings)

    if (window.settingsOverlay) {
      window.settingsOverlay.addEventListener('click', (e) => {
        if (e.target === window.settingsOverlay) this.closeSettings()
      })
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window.settingsOverlay && window.settingsOverlay.style.display !== 'none') {
        this.closeSettings()
      }
    })

    // Check for updates
    const btnUpdate = window.$('btn-check-updates')
    if (btnUpdate) {
      btnUpdate.addEventListener('click', async () => {
        const statusEl = window.$('update-status')
        btnUpdate.disabled = true
        if (statusEl) statusEl.textContent = 'Checking…'
        try {
          const result = await window.api.checkForUpdates()
          if (result.error) {
            if (statusEl) statusEl.textContent = 'Could not check: ' + result.error
          } else if (!result.latest) {
            if (statusEl) statusEl.textContent = 'No release info available'
          } else if (result.current === result.latest) {
            if (statusEl) statusEl.textContent = `v${result.current} — up to date`
          } else {
            if (statusEl) {
              statusEl.innerHTML = `v${result.current} → <a href="#" id="update-link">v${result.latest} available</a>`
              const link = window.$('update-link')
              if (link) link.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternal(result.url) })
            }
          }
        } catch {
          if (statusEl) statusEl.textContent = 'Check failed'
        }
        btnUpdate.disabled = false
      })
    }

    // Editor settings
    ['setting-font-family', 'setting-font-size', 'setting-side-margin', 'setting-tb-margin', 'setting-line-numbers', 'setting-sync-scroll', 'setting-editor-theme', 'setting-term-font-family', 'setting-term-font-size', 'setting-term-padding', 'setting-term-line-height', 'setting-term-letter-spacing', 'setting-term-cursor', 'setting-term-theme', 'setting-theme', 'setting-restore-session'].forEach(id => {
      const el = window.$(id);
      if (el) {
        const event = (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'range')) ? 'input' : 'change';
        el.addEventListener(event, (e) => {
          if (id === 'setting-font-family') window.settings.fontFamily = e.target.value;
          else if (id === 'setting-font-size') { window.settings.fontSize = parseInt(e.target.value, 10); window.$('font-size-display').textContent = window.settings.fontSize + 'px'; }
          else if (id === 'setting-side-margin') { window.settings.sideMargin = parseInt(e.target.value, 10); window.$('side-margin-display').textContent = window.settings.sideMargin + 'px'; }
          else if (id === 'setting-tb-margin') { window.settings.tbMargin = parseInt(e.target.value, 10); window.$('tb-margin-display').textContent = window.settings.tbMargin + 'px'; }
          else if (id === 'setting-line-numbers') window.settings.lineNumbers = e.target.checked;
          else if (id === 'setting-sync-scroll') { window.settings.syncScroll = e.target.checked; window.syncScrollActive = e.target.checked; if(document.getElementById('btn-sync-scroll')) document.getElementById('btn-sync-scroll').classList.toggle('active', window.syncScrollActive); }
          else if (id === 'setting-editor-theme') window.settings.editorTheme = e.target.value;
          else if (id === 'setting-term-font-family') window.settings.termFontFamily = e.target.value;
          else if (id === 'setting-term-font-size') { window.settings.termFontSize = parseInt(e.target.value, 10); window.$('term-font-size-display').textContent = window.settings.termFontSize + 'px'; }
          else if (id === 'setting-term-padding') { window.settings.termPadding = parseInt(e.target.value, 10); window.$('term-padding-display').textContent = window.settings.termPadding + 'px'; }
          else if (id === 'setting-term-line-height') { window.settings.termLineHeight = parseInt(e.target.value, 10); window.$('term-line-height-display').textContent = (window.settings.termLineHeight / 10).toFixed(1); }
          else if (id === 'setting-term-letter-spacing') { window.settings.termLetterSpacing = parseInt(e.target.value, 10); window.$('term-letter-spacing-display').textContent = window.settings.termLetterSpacing + 'px'; }
          else if (id === 'setting-term-cursor') window.settings.termCursorStyle = e.target.value;
          else if (id === 'setting-term-theme') window.settings.termTheme = e.target.value;
          else if (id === 'setting-theme') window.settings.theme = e.target.value;
          else if (id === 'setting-restore-session') window.settings.restoreSession = e.target.checked;

          if (id.startsWith('setting-term')) window.applyTerminalSettings();
          else if (id === 'setting-theme') window.applyTheme();
          else if (id.startsWith('setting-')) window.EditorManager.applyEditorSettings();
          window.saveSettingsDebounced();
        });
      }
    });
  },

  closeSettings() {
    window.settingsOverlay.style.display = 'none'
    const btn = window.$('btn-settings')
    if (btn) btn.classList.remove('active')
  }
};
