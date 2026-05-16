# CodeView

A native macOS code and markdown editor built with Electron. Designed for developers — integrated terminal, syntax highlighting for 10+ languages, live preview, and a clean native macOS interface.

## Features

- **Native macOS look and feel** — hidden titlebar with traffic lights, vibrancy sidebar, system font defaults
- **Splash screen** — branded launch screen with quick actions (Open File, Open Folder, New File, Terminal) and recent files list
- **Integrated terminal** — full zsh terminal with PTY support, multiple sessions (tabbed), maximize/restore, persistent state, and custom `cview` commands
- **Syntax-highlighted editor** — CodeMirror-powered with language-specific highlighting for 10+ file types
- **Live preview** — rendered markdown preview with full GFM support (tables, task lists, fenced code)
- **HTML preview** — live rendered HTML in a sandboxed iframe
- **Split view** — editor and preview side by side, or toggle between edit-only and preview-only modes
- **Synchronized scrolling** — optional linked scrolling between editor and preview in split view
- **Collapsible sidebar** — vertical tabs and file tree, collapse/expand with toolbar button or `Cmd+B`
- **Multi-folder file tree** — open multiple folders as independently collapsible sections (collapsed by default), with remove on hover and persistent state
- **10+ language modes** — Markdown, JSON, HTML, JavaScript, TypeScript, Python, YAML, Shell scripts, plain text
- **Resizable panes** — drag to resize the sidebar, editor, terminal, and preview panels
- **New file/folder creation** — create files and folders from the sidebar
- **Session restore** — reopen previously open tabs and folders on launch
- **System theme** — follows macOS dark/light mode automatically, or set manually
- **Customizable fonts** — JetBrains Mono, Fira Code, Cascadia Code, Hack, 0xProto, SF Mono, Menlo, Monaco, PT Mono, and more (independent editor and terminal font selection)
- **Adjustable margins** — configure side and top/bottom editor padding
- **Terminal settings** — independent font family, font size, padding, line height, letter spacing, cursor style, syntax color theme
- **Syntax color themes** — six terminal ANSI palettes: Apple Dark, Kaku, Dracula, Nord, Solarized Dark, One Dark (background stays constant; only syntax colors change)
- **Tabbed settings** — organized into Editor, Terminal, and General tabs (no scrolling)
- **Clickable links** — hyperlinks in preview open in your default browser
- **Recent files** — splash screen shows recently opened files

## Screenshots

| Splash Screen | Editor View |
|---------------|-------------|
| *(splash-screen.png)* | *(primary-view.png)* |

## Installation

### From Source

```bash
git clone https://github.com/dkeg/codeview.git
cd codeview
npm install
npm run rebuild
npm start
```

### Build as macOS App

```bash
npm run build
```

The built `.app` will be in `dist/mac-arm64/`. Copy it to `~/Applications/` or `/Applications/`.

```bash
cp -R dist/mac-arm64/CodeView.app ~/Applications/
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New file |
| `Cmd+O` | Open file |
| `Cmd+Shift+O` | Open folder |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save as |
| `Cmd+W` | Close tab |
| `Cmd+1` | Editor only |
| `Cmd+2` | Split view |
| `Cmd+3` | Preview only |
| `Cmd+B` | Toggle sidebar |
| `Cmd+Shift+P` | Cycle view modes |
| `` Cmd+` `` | Toggle terminal |
| `Cmd+,` | Settings |

## Terminal

The integrated terminal provides a full zsh shell at the bottom of the editor:

- Toggle with `` Cmd+` `` or the terminal button in the toolbar
- Starts in the first open folder or `$HOME`
- Resizable by dragging the top divider
- Maximize/restore button for full-screen terminal mode
- Multiple sessions with tabbed interface
- Available directly from the splash screen

## Settings

Access via `Cmd+,` or the app menu. Settings are organized into three tabs:

### Editor
- **Font Family** — JetBrains Mono, Fira Code, Cascadia Code, Hack, SF Mono, Menlo, and more
- **Font Size** — 10px to 24px slider
- **Side Margins** — Adjust left/right editor and preview padding (8px to 80px)
- **Top & Bottom Margins** — Adjust vertical editor and preview padding (8px to 80px)
- **Line Numbers** — Toggle line number gutter in the editor
- **Sync Scroll** — Toggle synchronized scrolling between editor and preview in split view

### Terminal
- **Font Family** — Independent terminal font selection
- **Font Size** — Independent terminal font size
- **Padding** — Terminal inner padding
- **Line Height** — Terminal line height
- **Letter Spacing** — Terminal letter spacing
- **Cursor Style** — Block, underline, or bar
- **Syntax Color** — Terminal ANSI palette (Apple Dark, Kaku, Dracula, Nord, Solarized Dark, One Dark)

### General
- **Theme** — System (auto), Light, or Dark
- **Restore Session** — Reopen previously open tabs on launch

## Supported File Types

| Extension | Mode |
|-----------|------|
| `.md`, `.markdown` | Markdown with syntax highlighting |
| `.json` | JSON with formatted preview |
| `.html`, `.htm` | HTML with live rendered preview |
| `.js`, `.mjs`, `.cjs` | JavaScript |
| `.ts`, `.tsx` | TypeScript |
| `.py` | Python |
| `.yaml`, `.yml` | YAML |
| `.sh`, `.bash`, `.zsh` | Shell scripts |
| `.txt` | Plain text |

## Tech Stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop app framework
- [CodeMirror 5](https://codemirror.net/5/) — syntax-highlighted code editor
- [xterm.js](https://xtermjs.org/) — terminal emulator
- [node-pty](https://github.com/microsoft/node-pty) — native PTY bindings for Node.js
- [marked](https://marked.js.org/) — fast markdown parser and renderer

## Project Structure

```
codeview/
├── main.js          # Electron main process + PTY management
├── preload.js       # Context bridge (IPC + terminal)
├── renderer.js      # UI logic, CodeMirror, xterm, tabs, file tree
├── index.html       # App layout + script loaders
├── styles.css       # All styling (light/dark themes, terminal, CodeMirror)
├── package.json     # Dependencies and build config
├── CHANGELOG.md     # Version history
└── assets/
    ├── icon-dark.icns   # App icon
    └── theme-kaku.css   # Kaku editor theme (CodeMirror)
```

## License

MIT
