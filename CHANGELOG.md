# Changelog

All notable changes to CodeView will be documented here.

---

## [1.0.0] — 2026-05-16

### Initial release

#### App
- Native macOS window with hidden titlebar, traffic light controls, and vibrancy sidebar
- Electron main process with full IPC bridge via context-isolated preload
- Session restore — reopens previously open tabs and folders on launch
- File open from Finder via `open-file` event (double-click any associated file)
- Full app menu with all keyboard shortcuts wired to renderer events
- Settings persisted to `userData` (theme, font, margins, line numbers, sync scroll, session)

#### Editor
- CodeMirror 5 with 8 language modes: markdown, JSON, HTML, JavaScript/TypeScript, Python, YAML, shell scripts, plain text
- Syntax highlighting tuned for both dark and light themes
- Line numbers, active line highlight, matching brackets, auto-close brackets
- Customizable font family and size with adjustable side/top/bottom margins
- `Cmd+S` / `Cmd+Shift+S` save and save-as

#### Preview
- Live rendered markdown via `marked` (GFM — tables, task lists, fenced code blocks)
- JSON files render as formatted, indented text
- HTML files render as live preview in sandboxed iframe
- Synchronized bidirectional scrolling between editor and preview (toggleable)
- Clickable links open in default browser via `shell.openExternal`

#### Terminal
- Integrated zsh terminal using node-pty (real PTY, not fake shell)
- xterm.js v6 with full color support, 256-color theme, blink cursor
- Multiple terminal sessions with tabbed interface
- Maximize/restore for full-screen terminal mode
- Resizable terminal panel via drag handle
- Web links add-on for clickable URLs
- Terminal accessible from splash screen and toolbar
- Independent terminal font, size, padding, line height, letter spacing, cursor style settings

#### Sidebar
- Multi-folder file tree — open any number of folders as independent collapsible sections
- Folders collapsed by default, with expand/collapse toggle
- Remove folder button on hover
- File tree supports all 10+ file types with appropriate icons
- Vertical tab list with modified indicator and close button

#### Splash Screen
- Replaces welcome screen — shown when no tabs are open
- `</>` logo with cyan/purple gradient
- Quick action buttons: Open File, Open Folder, New File, Terminal
- Recent files list (up to 8 entries) with file name and path

#### Layout
- Split view, editor-only, and preview-only modes (`Cmd+1` / `Cmd+2` / `Cmd+3`)
- Resizable sidebar, editor/preview, and terminal panels via drag handles
- Toggle sidebar (`Cmd+B`), toggle terminal (`` Cmd+` ``)

#### Theme
- Follows macOS system dark/light mode automatically via `nativeTheme`
- Manual override in settings (System / Light / Dark)
- Fully separate light and dark color palettes throughout
- Dark mode syntax colors optimized for `#0d0d0f` terminal background

#### Settings
- Tabbed settings modal: Editor / Terminal / General (no scrolling required)
- Editor: font family, font size, side margins, top/bottom margins, line numbers, sync scroll
- Terminal: font family, font size, padding, line height, letter spacing, cursor style
- General: theme, restore session

#### Icon
- `</>` motif — terminal window chrome with colored traffic lights
- Gradient symbol: cyan (#5BC8F5) to purple (#A78BFA)
- Dark background: deep navy with blue/purple ambient glows
- Decorative syntax token lines at bottom
- Generated to full macOS iconset (12 sizes, 16px–1024px) via `iconutil`

#### Build
- `electron-builder` configured for macOS universal (arm64 + x64) DMG
- 10 file type associations registered
- `node_modules/`, `dist/`, `.claude/` excluded via `.gitignore`
- `electron-rebuild -f -w node-pty` included in build script
