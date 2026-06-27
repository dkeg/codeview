/* globals */
'use strict';

// ─── Global State ───────────────────────────────────────────────────────────
window.isSyncScrolling = false;
window.settings = {};
window.systemTheme = 'light';
window.homeDir = '';
window.viewMode = 'editor';
window.sidebarVisible = true;
window.activeActivity = 'folders';
window.terminalVisible = false;
window.terminalMaximized = false;
window.splashLocked = false;

// ─── DOM References ─────────────────────────────────────────────────────────
window.$ = id => document.getElementById(id);

// Initialize refs as null
window.activityBar          = null;
window.sidebar              = null;
window.tabsList             = null;
window.fileTreesContainer   = null;
window.panels               = null;
window.editorPanel          = null;
window.previewPanel         = null;
window.previewContent       = null;
window.htmlPreview          = null;
window.fileNameDisplay      = null;
window.modifiedIndicator    = null;
window.splashScreen         = null;
window.settingsOverlay      = null;
window.sidebarResizeHandle  = null;
window.panelsResizeHandle   = null;
window.terminalPanel        = null;
window.terminalTabs         = null;
window.terminalSessions     = null;
window.terminalResizeHandle = null;

// ─── Shared Utilities ───────────────────────────────────────────────────────
window.escHtml = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
