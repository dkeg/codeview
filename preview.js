/* globals activeTab, htmlPreview, previewContent, api */
'use strict';

window.PreviewManager = {
  updatePreview() {
    const tab = window.activeTab()
    window.htmlPreview.style.display = 'none'
    window.previewContent.style.display = ''

    if (!tab) { window.previewContent.innerHTML = ''; return }

    if (tab.type === 'html') {
      window.previewContent.style.display = 'none'
      window.htmlPreview.style.display = 'block'

      let content = tab.content
      if (tab.filePath) {
        const dir = tab.filePath.split('/').slice(0, -1).join('/') + '/'
        const baseTag = `<base href="file://${dir}">`
        if (content.includes('<head>')) {
          content = content.replace('<head>', '<head>' + baseTag)
        } else if (content.includes('<html>')) {
          content = content.replace('<html>', '<html>' + baseTag)
        } else {
          content = baseTag + content
        }
      }

      // Blob URLs are same-origin and always work in Electron
      if (window.htmlPreview._blobUrl) URL.revokeObjectURL(window.htmlPreview._blobUrl)
      const blob = new Blob([content], { type: 'text/html; charset=utf-8' })
      window.htmlPreview._blobUrl = URL.createObjectURL(blob)
      window.htmlPreview.removeAttribute('srcdoc')
      window.htmlPreview.src = window.htmlPreview._blobUrl
      return
    }

    if (tab.type === 'json') {
      try {
        const parsed = JSON.parse(tab.content)
        window.previewContent.className = 'json-preview'
        window.previewContent.textContent = JSON.stringify(parsed, null, 2)
      } catch {
        window.previewContent.className = 'json-preview'
        window.previewContent.textContent = tab.content
      }
      return
    }

    window.previewContent.className = ''
    window.previewContent.innerHTML = window.api.renderMarkdown(tab.content)
    window.previewContent.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = true })
  },

  bindPreviewLinks() {
    window.previewContent.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || href.startsWith('#')) return
      e.preventDefault()
      if (href.startsWith('http://') || href.startsWith('https://')) {
        window.api.openExternal(href)
      }
    })
  }
};
