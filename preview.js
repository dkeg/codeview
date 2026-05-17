/* globals activeTab, htmlPreview, previewContent, api */
'use strict';

window.PreviewManager = {
  updatePreview() {
    const tab = activeTab()
    htmlPreview.style.display = 'none'
    previewContent.style.display = ''

    if (!tab) { previewContent.innerHTML = ''; return }

    if (tab.type === 'html') {
      previewContent.style.display = 'none'
      htmlPreview.style.display = 'flex'
      htmlPreview.style.flex = '1'

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
      
      htmlPreview.removeAttribute('src')
      htmlPreview.srcdoc = content
      return
    }

    if (tab.type === 'json') {
      try {
        const parsed = JSON.parse(tab.content)
        previewContent.className = 'json-preview'
        previewContent.textContent = JSON.stringify(parsed, null, 2)
      } catch {
        previewContent.className = 'json-preview'
        previewContent.textContent = tab.content
      }
      return
    }

    previewContent.className = ''
    previewContent.innerHTML = api.renderMarkdown(tab.content)
    previewContent.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = true })
  },

  bindPreviewLinks() {
    previewContent.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || href.startsWith('#')) return
      e.preventDefault()
      if (href.startsWith('http://') || href.startsWith('https://')) {
        api.openExternal(href)
      }
    })
  }
};
