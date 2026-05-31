/* globals CodeMirror */
'use strict'

// ─── Slash command definitions ────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { label: 'Heading 1',      icon: 'H1', description: 'Large heading',         insert: '# ',              type: 'line' },
  { label: 'Heading 2',      icon: 'H2', description: 'Medium heading',        insert: '## ',             type: 'line' },
  { label: 'Heading 3',      icon: 'H3', description: 'Small heading',         insert: '### ',            type: 'line' },
  { label: 'Bold',           icon: 'B',  description: 'Bold text',             insert: '****',            type: 'wrap', wrap: ['**', '**'] },
  { label: 'Italic',         icon: 'I',  description: 'Italic text',           insert: '__',              type: 'wrap', wrap: ['_', '_'] },
  { label: 'Strikethrough',  icon: 'S',  description: 'Strikethrough text',    insert: '~~~~',            type: 'wrap', wrap: ['~~', '~~'] },
  { label: 'Inline Code',    icon: '`',  description: 'Inline code',           insert: '``',              type: 'wrap', wrap: ['`', '`'] },
  { label: 'Bullet List',    icon: '•',  description: 'Bulleted list',         insert: '- ',              type: 'line' },
  { label: 'Numbered List',  icon: '1.', description: 'Numbered list',         insert: '1. ',             type: 'line' },
  { label: 'Quote',          icon: '"',  description: 'Block quote',           insert: '> ',              type: 'line' },
  { label: 'Code Block',     icon: '</>', description: 'Fenced code block',    insert: '```\n\n```',      type: 'block', cursor: [1, 0] },
  { label: 'Mermaid',        icon: '◇',  description: 'Mermaid diagram',       insert: '```mermaid\n\n```', type: 'block', cursor: [1, 0] },
  { label: 'Table',          icon: '▦',  description: 'Markdown table',        insert: '| Column 1 | Column 2 |\n|----------|----------|\n| Cell     | Cell     |', type: 'block' },
  { label: 'Divider',        icon: '—',  description: 'Horizontal rule',       insert: '\n---\n',         type: 'block' },
  { label: 'Link',           icon: '⌘', description: 'Hyperlink',             insert: '[]()',            type: 'block', cursor: [0, 1] },
  { label: 'Image',          icon: '⬛', description: 'Image',                insert: '![]()',           type: 'block', cursor: [0, 2] },
  { label: 'Task List',      icon: '☐',  description: 'Task/checklist item',   insert: '- [ ] ',         type: 'line' },
]

// ─── Context menu definitions ─────────────────────────────────────────────────
const CONTEXT_ACTIONS = [
  { label: 'Bold',          wrap: ['**', '**'],   requiresSelection: false },
  { label: 'Italic',        wrap: ['_', '_'],      requiresSelection: false },
  { label: 'Strikethrough', wrap: ['~~', '~~'],    requiresSelection: false },
  { label: 'Inline Code',   wrap: ['`', '`'],      requiresSelection: false },
  { label: '─',             separator: true },
  { label: 'Link',          fn: 'wrapLink',        requiresSelection: false },
  { label: 'Image',         fn: 'insertImage',     requiresSelection: false },
  { label: '─',             separator: true },
  { label: 'Heading 1',     prefix: '# ',          requiresSelection: false },
  { label: 'Heading 2',     prefix: '## ',         requiresSelection: false },
  { label: 'Heading 3',     prefix: '### ',        requiresSelection: false },
  { label: '─',             separator: true },
  { label: 'Code Block',    fn: 'insertCodeBlock', requiresSelection: false },
  { label: 'Mermaid',       fn: 'insertMermaid',   requiresSelection: false },
  { label: 'Quote',         prefix: '> ',          requiresSelection: false },
]

// ─── State ────────────────────────────────────────────────────────────────────
let slashMenu = null
let slashStartPos = null
let selectedIndex = 0
let filteredCommands = []
let contextMenu = null

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isMarkdownTab() {
  const tab = window.activeTab ? window.activeTab() : null
  return tab && (tab.type === 'markdown' || !tab.type)
}

function closeSlashMenu() {
  if (slashMenu) { slashMenu.remove(); slashMenu = null }
  slashStartPos = null
  selectedIndex = 0
}

function closeContextMenu() {
  if (contextMenu) { contextMenu.remove(); contextMenu = null }
}

// ─── Slash menu rendering ─────────────────────────────────────────────────────
function renderSlashMenu(commands, query) {
  filteredCommands = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  if (!filteredCommands.length) { closeSlashMenu(); return }
  if (selectedIndex >= filteredCommands.length) selectedIndex = 0

  if (!slashMenu) {
    slashMenu = document.createElement('div')
    slashMenu.className = 'slash-menu'
    document.body.appendChild(slashMenu)
  }

  slashMenu.innerHTML = filteredCommands.map((cmd, i) => `
    <div class="slash-item${i === selectedIndex ? ' selected' : ''}" data-index="${i}">
      <span class="slash-icon">${cmd.icon}</span>
      <span class="slash-label">${cmd.label}</span>
      <span class="slash-desc">${cmd.description}</span>
    </div>
  `).join('')

  slashMenu.querySelectorAll('.slash-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      selectedIndex = parseInt(el.dataset.index)
      executeSlashCommand()
    })
    el.addEventListener('mouseenter', () => {
      slashMenu.querySelectorAll('.slash-item').forEach(x => x.classList.remove('selected'))
      el.classList.add('selected')
      selectedIndex = parseInt(el.dataset.index)
    })
  })

  positionSlashMenu()
}

function positionSlashMenu() {
  if (!slashMenu || !slashStartPos) return
  const editor = window.EditorManager.editor
  const coords = editor.charCoords(slashStartPos, 'window')
  const menuH = slashMenu.offsetHeight
  const winH = window.innerHeight
  const top = coords.bottom + menuH > winH ? coords.top - menuH : coords.bottom
  slashMenu.style.left = coords.left + 'px'
  slashMenu.style.top = top + 'px'
}

// ─── Slash command execution ──────────────────────────────────────────────────
function executeSlashCommand() {
  const cmd = filteredCommands[selectedIndex]
  if (!cmd) return
  const editor = window.EditorManager.editor
  const cursor = editor.getCursor()

  // Delete from slash position to current cursor
  editor.replaceRange('', slashStartPos, cursor)
  closeSlashMenu()

  const pos = editor.getCursor()

  if (cmd.type === 'line') {
    const lineContent = editor.getLine(pos.line)
    if (lineContent.trim() === '') {
      editor.replaceRange(cmd.insert, { line: pos.line, ch: 0 }, { line: pos.line, ch: lineContent.length })
      editor.setCursor({ line: pos.line, ch: cmd.insert.length })
    } else {
      editor.replaceRange('\n' + cmd.insert, pos)
      editor.setCursor({ line: pos.line + 1, ch: cmd.insert.length })
    }
  } else if (cmd.type === 'wrap') {
    const [open, close] = cmd.wrap
    editor.replaceRange(open + close, pos)
    editor.setCursor({ line: pos.line, ch: pos.ch + open.length })
  } else {
    // block
    editor.replaceRange(cmd.insert, pos)
    if (cmd.cursor) {
      editor.setCursor({ line: pos.line + cmd.cursor[0], ch: cmd.cursor[1] })
    }
  }

  editor.focus()
}

// ─── Context menu execution ───────────────────────────────────────────────────
function executeContextAction(action) {
  const editor = window.EditorManager.editor
  const sel = editor.getSelection()
  closeContextMenu()

  if (action.wrap) {
    const [open, close] = action.wrap
    if (sel) {
      editor.replaceSelection(open + sel + close)
    } else {
      const pos = editor.getCursor()
      editor.replaceRange(open + close, pos)
      editor.setCursor({ line: pos.line, ch: pos.ch + open.length })
    }
  } else if (action.prefix) {
    const pos = editor.getCursor()
    const line = editor.getLine(pos.line)
    editor.replaceRange(action.prefix + line.replace(/^#+\s*|^>\s*|^-\s*/, ''), { line: pos.line, ch: 0 }, { line: pos.line, ch: line.length })
  } else if (action.fn === 'wrapLink') {
    const pos = editor.getCursor()
    if (sel) {
      editor.replaceSelection(`[${sel}]()`)
      editor.setCursor({ line: pos.line, ch: pos.ch + sel.length + 3 })
    } else {
      editor.replaceRange('[]()', pos)
      editor.setCursor({ line: pos.line, ch: pos.ch + 1 })
    }
  } else if (action.fn === 'insertImage') {
    const pos = editor.getCursor()
    editor.replaceRange('![]()', pos)
    editor.setCursor({ line: pos.line, ch: pos.ch + 2 })
  } else if (action.fn === 'insertCodeBlock') {
    const pos = editor.getCursor()
    editor.replaceRange('```\n\n```', pos)
    editor.setCursor({ line: pos.line + 1, ch: 0 })
  } else if (action.fn === 'insertMermaid') {
    const pos = editor.getCursor()
    editor.replaceRange('```mermaid\n\n```', pos)
    editor.setCursor({ line: pos.line + 1, ch: 0 })
  }

  editor.focus()
}

// ─── Context menu rendering ───────────────────────────────────────────────────
function showContextMenu(x, y) {
  closeContextMenu()
  contextMenu = document.createElement('div')
  contextMenu.className = 'editor-context-menu'

  CONTEXT_ACTIONS.forEach(action => {
    if (action.separator) {
      const sep = document.createElement('div')
      sep.className = 'context-separator'
      contextMenu.appendChild(sep)
      return
    }
    const item = document.createElement('div')
    item.className = 'context-item'
    item.textContent = action.label
    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      executeContextAction(action)
    })
    contextMenu.appendChild(item)
  })

  document.body.appendChild(contextMenu)

  // Flip if off-screen
  const menuW = contextMenu.offsetWidth
  const menuH = contextMenu.offsetHeight
  const left = x + menuW > window.innerWidth ? x - menuW : x
  const top = y + menuH > window.innerHeight ? y - menuH : y
  contextMenu.style.left = left + 'px'
  contextMenu.style.top = top + 'px'
}

// ─── Wire up to editor ────────────────────────────────────────────────────────
window.initEditorCommands = function() {
  const editor = window.EditorManager.editor
  if (!editor) return

  // ── Slash command: detect "/" on blank line ──
  editor.on('change', (cm, change) => {
    if (!isMarkdownTab()) return
    if (change.text[0] !== '/') {
      if (slashMenu) {
        // User typed more — filter, or close if they cleared the line
        if (slashStartPos) {
          const cursor = cm.getCursor()
          const typed = cm.getRange(slashStartPos, cursor)
          if (typed.startsWith('/')) {
            renderSlashMenu(SLASH_COMMANDS, typed.slice(1))
          } else {
            closeSlashMenu()
          }
        }
      }
      return
    }

    const cursor = cm.getCursor()
    const line = cm.getLine(cursor.line)
    const beforeSlash = line.slice(0, cursor.ch - 1).trim()
    if (beforeSlash !== '') return

    slashStartPos = { line: cursor.line, ch: cursor.ch - 1 }
    selectedIndex = 0
    renderSlashMenu(SLASH_COMMANDS, '')
  })

  // Close slash menu on cursor move (click elsewhere)
  editor.on('cursorActivity', (cm) => {
    if (!slashMenu || !slashStartPos) return
    const cursor = cm.getCursor()
    if (cursor.line !== slashStartPos.line || cursor.ch < slashStartPos.ch) {
      closeSlashMenu()
    }
  })

  // Keyboard nav for slash menu
  editor.addKeyMap({
    'ArrowDown': () => {
      if (!slashMenu) return CodeMirror.Pass
      selectedIndex = (selectedIndex + 1) % filteredCommands.length
      renderSlashMenu(SLASH_COMMANDS, slashMenu ? slashMenu._query || '' : '')
      slashMenu._query = slashMenu._query || ''
      slashMenu.querySelectorAll('.slash-item')[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    },
    'ArrowUp': () => {
      if (!slashMenu) return CodeMirror.Pass
      selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length
      renderSlashMenu(SLASH_COMMANDS, slashMenu ? slashMenu._query || '' : '')
      slashMenu.querySelectorAll('.slash-item')[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    },
    'Enter': () => {
      if (!slashMenu) return CodeMirror.Pass
      executeSlashCommand()
    },
    'Escape': () => {
      if (!slashMenu) return CodeMirror.Pass
      closeSlashMenu()
    },
    'Tab': () => {
      if (!slashMenu) return CodeMirror.Pass
      executeSlashCommand()
    }
  })

  // Track slash query as user types
  editor.on('change', (cm) => {
    if (slashMenu && slashStartPos) {
      const cursor = cm.getCursor()
      const typed = cm.getRange(slashStartPos, cursor)
      slashMenu._query = typed.slice(1)
    }
  })

  // ── Context menu ──
  editor.getWrapperElement().addEventListener('contextmenu', (e) => {
    if (!isMarkdownTab()) return
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY)
  })

  // Close menus on outside click
  document.addEventListener('mousedown', (e) => {
    if (contextMenu && !contextMenu.contains(e.target)) closeContextMenu()
    if (slashMenu && !slashMenu.contains(e.target)) closeSlashMenu()
  })
}
