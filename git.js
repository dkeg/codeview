/* globals api, FileTree */
'use strict';

window.GitManager = {
  statusCache: new Map(), // folderPath -> { lastUpdate, status: { relativePath -> code } }
  currentBranch: null,

  async getStatus(folderPath) {
    const result = await api.getGitStatus(folderPath)
    if (result.success) {
      this.statusCache.set(folderPath, {
        lastUpdate: Date.now(),
        status: result.status
      })
      return result.status
    }
    return null
  },

  async updateBranch(folderPath) {
    const result = await api.getGitBranch(folderPath)
    const display = document.getElementById('git-branch-display')
    const nameEl = document.getElementById('branch-name')
    
    if (result.success && result.branch) {
      this.currentBranch = result.branch
      nameEl.textContent = result.branch
      display.style.display = 'flex'
    } else {
      display.style.display = 'none'
    }
  },

  async refreshAll() {
    for (const folder of FileTree.openFolders) {
      await this.getStatus(folder.path)
      // Only show branch for the first open folder for now
      if (folder === FileTree.openFolders[0]) {
        await this.updateBranch(folder.path)
      }
    }
    FileTree.renderAllFolderSections()
  },

  getFileStatus(folderPath, relativePath) {
    const cached = this.statusCache.get(folderPath)
    if (!cached) return null
    
    // Git status returns relative paths from repo root
    // We need to match the relative path from the opened folder
    return cached.status[relativePath] || null
  }
};

// Auto-refresh Git status when the window is focused
window.addEventListener('focus', () => {
  if (window.GitManager) {
    window.GitManager.refreshAll()
  }
});
