# CodeView

A native macOS code and markdown editor built with Electron. Designed for developers — integrated terminal, syntax highlighting for 10+ languages, live preview, and a clean native macOS interface.

## Features

- **Native macOS look and feel** — hidden titlebar with traffic lights, vibrancy sidebar, system font defaults
- **Git Integration** — visual status indicators in the sidebar (modified, untracked, added) and current branch display in the toolbar
- **Splash screen** — branded launch screen with quick actions (Open File, Open Folder, New File, Terminal) and recent files list
- **Integrated terminal** — full zsh terminal with PTY support, bottom-aligned tabs, active state highlight, maximize/restore, and persistent state
- **Syntax-highlighted editor** — CodeMirror-powered with language-specific highlighting for 10+ file types
- **Live preview** — rendered markdown preview with full GFM support (tables, task lists, fenced code)
- **HTML preview** — live rendered HTML with `<base>` tag injection for relative asset support and instant `srcdoc` updates
- **Split view** — editor and preview side by side, or toggle between edit-only and preview-only modes
- **Synchronized scrolling** — optional linked scrolling between editor and preview in split view
- **Collapsible sidebar** — vertical tabs and file tree, collapse/expand with toolbar button or `Cmd+B`
- **Multi-folder file tree** — open multiple folders as independently collapsible sections
- **Modular Architecture** — clean, decoupled codebase with dedicated managers for tabs, terminal, git, and more
- **10+ language modes** — Markdown, JSON, HTML, JavaScript, TypeScript, Python, YAML, Shell scripts, plain text
- **Resizable panes** — drag to resize the sidebar, editor, terminal, and preview panels
- **Session restore** — reopen previously open tabs and folders on launch
- **System theme** — follows macOS dark/light mode automatically, or set manually
- **Customizable fonts** — independent editor and terminal font selection
- **Adjustable margins** — configure side and top/bottom editor padding
- **Terminal settings** — independent font family, font size, padding, line height, letter spacing, cursor style, syntax color theme
- **Syntax color themes** — six terminal ANSI palettes: Apple Dark, Kaku, Dracula, Nord, Solarized Dark, One Dark
- **Tabbed settings** — organized into Editor, Terminal, and General tabs
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

The built `.app` will be in `dist/mac-arm64/` (for Apple Silicon) or `dist/mac-x64/` (for Intel).

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

The integrated terminal provides a full zsh shell at the bottom of the application:

- **Bottom Tabs:** Terminal sessions are managed at the bottom for a cleaner layout.
- **Active State:** Current session is highlighted with a lighter shade and a color dot indicator.
- **Persistence:** Starts in the first open folder or `$HOME`.
- **Resizable:** Drag the top divider to adjust height.
- **Maximize/Restore:** Dedicated button for full-panel terminal mode.
- **Multiple sessions:** Support for multiple tabbed sessions.

## Git Integration

CodeView includes built-in Git support for a smoother development workflow:

- **Sidebar Status:** Files in the tree are color-coded based on their Git state:
    - **Orange (M):** Modified files.
    - **Green (??):** Untracked/New files.
- **Branch Indicator:** The current Git branch is displayed in the center of the toolbar.
- **Auto-Refresh:** Status and branch information refresh automatically when the window is focused.

## Settings

Access via `Cmd+,` or the app menu. Settings are organized into three tabs:

### Editor
- **Font Family** — JetBrains Mono, Fira Code, SF Mono, Menlo, and more
- **Font Size** — 10px to 24px slider
- **Margins** — Adjust side and vertical padding
- **Line Numbers** — Toggle line number gutter
- **Sync Scroll** — Toggle synchronized scrolling

### Terminal
- **Font & Size** — Independent terminal typography settings
- **Layout** — Padding, line height, and letter spacing
- **Cursor** — Style (Block, underline, or bar)
- **Syntax Color** — Six ANSI palettes (Apple Dark, Kaku, Dracula, Nord, Solarized Dark, One Dark)

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
├── main.js             # Electron main process (Git, PTY, Files)
├── preload.js          # Secure API bridge
├── renderer.js         # Core UI Orchestrator
├── globals.js          # Global state & DOM initializer
├── terminal.js         # Terminal Management
├── file-tree.js        # Sidebar & Multi-folder logic
├── git.js              # Git Status & Branch logic
├── tabs.js             # Editor Tab Management
├── editor-manager.js   # CodeMirror Implementation
├── preview.js          # Preview Rendering
├── settings.js         # Preferences & Modal logic
├── icons.js            # SVG Library & Mapping
├── index.html          # App layout + script loaders
├── styles.css          # Global Styling
├── package.json        # Dependencies and build config
└── CHANGELOG.md        # Version history
```

## License

MIT
