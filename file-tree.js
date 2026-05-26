/* globals api, Icons, escHtml, openFile, saveSessionDebounced, fileTreesContainer */
'use strict';

window.FileTree = {
  openFolders: [],

  addFolder(folderPath) {
    if (this.openFolders.find(f => f.path === folderPath)) return
    const name = folderPath.split('/').pop()
    this.openFolders.push({ path: folderPath, name, expanded: {}, collapsed: false })
    this.renderAllFolderSections()
    window.saveSessionDebounced()
  },

  removeFolder(folderPath) {
    this.openFolders = this.openFolders.filter(f => f.path !== folderPath)
    this.renderAllFolderSections()
    window.saveSessionDebounced()
  },

  renderAllFolderSections() {
    window.fileTreesContainer.innerHTML = ''
    this.openFolders.forEach(folder => this.renderFolderSection(folder))
    if (window.updateHomeSection) window.updateHomeSection()
  },

  renderFolderSection(folder) {
    const section = document.createElement('div')
    section.className = 'folder-section' + (folder.collapsed ? ' collapsed' : '')
    section.dataset.path = folder.path

    section.innerHTML = `
      <div class="folder-section-header">
        <svg class="folder-section-toggle" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
        </svg>
        <span class="folder-section-name">${window.escHtml(folder.name)}</span>
        <button class="folder-section-remove" title="Remove folder">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
      </div>
      <div class="folder-section-tree"></div>
    `

    const header = section.querySelector('.folder-section-header')
    const removeBtn = section.querySelector('.folder-section-remove')
    const treeEl = section.querySelector('.folder-section-tree')

    header.addEventListener('click', (e) => {
      if (e.target.closest('.folder-section-remove')) return
      folder.collapsed = !folder.collapsed
      section.classList.toggle('collapsed', folder.collapsed)
      window.saveSessionDebounced()
    })

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.removeFolder(folder.path)
    })

    window.fileTreesContainer.appendChild(section)
    this.renderFileTree(folder.path, treeEl, 0, folder)
  },

  async renderFileTree(dirPath, container, depth, folder) {
    container.innerHTML = ''
    let entries
    try { entries = await window.api.readDir(dirPath) } catch { return }

    // Fetch git status for the folder if we're at depth 0
    if (depth === 0) {
      await window.GitManager.getStatus(folder.path)
    }

    for (const entry of entries) {
      const item = document.createElement('div')
      const relativePath = entry.path.replace(folder.path + '/', '')
      const gitStatus = window.GitManager.getFileStatus(folder.path, relativePath)
      
      let gitClass = ''
      if (gitStatus === 'M') gitClass = ' git-modified'
      if (gitStatus === '??' || gitStatus === '?') gitClass = ' git-untracked'
      if (gitStatus === 'A') gitClass = ' git-added'

      item.className = 'tree-item' + (entry.isDirectory ? ' directory' : '') + gitClass
      item.style.paddingLeft = (6 + depth * 14) + 'px'

      const icon = entry.isDirectory ? window.Icons.iconFolder() : window.Icons.iconForPath(entry.name)
      item.innerHTML = `<span class="tree-item-icon">${icon}</span><span class="tree-item-name">${window.escHtml(entry.name)}</span>`

      if (entry.isDirectory) {
        const childContainer = document.createElement('div')
        childContainer.className = 'tree-children'
        childContainer.style.display = folder.expanded[entry.path] ? 'block' : 'none'

        item.addEventListener('click', async () => {
          const isOpen = childContainer.style.display !== 'none'
          childContainer.style.display = isOpen ? 'none' : 'block'
          folder.expanded[entry.path] = !isOpen
          if (!isOpen && childContainer.children.length === 0) {
            await this.renderFileTree(entry.path, childContainer, depth + 1, folder)
          }
        })

        container.appendChild(item)
        container.appendChild(childContainer)
        if (folder.expanded[entry.path]) {
          await this.renderFileTree(entry.path, childContainer, depth + 1, folder)
        }
      } else {
        if (!this.isEditableFile(entry.name)) item.style.opacity = '0.45'

        item.addEventListener('click', async () => {
          container.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'))
          item.classList.add('active')
          if (this.isEditableFile(entry.name)) await window.openFile(entry.path)
        })

        container.appendChild(item)
      }
    }
  },

  isEditableFile(name) {
    return /\.(md|markdown|json|html?|jsx?|mjs|cjs|tsx?|py|ya?ml|sh|bash|zsh|txt)$/i.test(name)
  }
};
