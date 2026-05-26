# Changelog

All notable changes to CodeView will be documented here.

---

## [1.4.2] — 2026-05-25

### Bug Fixes

- **File name hidden in maximized terminal** — title bar now clears the filename when the terminal is in full-screen mode; restores it when terminal is closed or restored
- **Splash screen scoped to editor area** — when terminal is open in lower-panel mode and all files are closed, the splash screen correctly appears only in the editor portion above the terminal

---

## [1.4.1] — 2026-05-26

### Bug Fixes

- **Emoji overlap in terminal** — fixed wide-character rendering by activating Unicode 11 width tables via `@xterm/addon-unicode11`; root cause was `allowProposedApi` not set on the Terminal instance, causing the `unicode.activeVersion` setter to throw silently
- **Terminal default directory** — new sessions now open at `$HOME` instead of the first open folder

### Other

- README reorganized from a flat feature list into structured sections with screenshots

---

## [1.4.0] — 2026-05-25

### New Features

- **Activity bar** — vertical icon rail on the left with Home, Files, Folders, Git, and Terminal sections; Settings and Help buttons at the bottom
- **Home panel** — sidebar panel showing all currently open files and folders at a glance with click-to-navigate
- **Help panel** — in-app keyboard shortcut reference accessible from the activity bar `?` button
- **Terminal collapse** — minimize terminal to its tab bar (↓ button) without closing the session; expands back on demand
- **Check for updates** — Settings → General tab now has a "Check for Updates" button that compares your version against the latest GitHub release
- **Shell environment detection** — main process resolves the full login-shell environment on startup so PATH, NVM, pyenv, and other tool shims are available in the terminal from the first keystroke
- **zsh prompt theme support** — terminal now spawns `zsh -l -i` so `.zshrc` is sourced and prompt themes (Oh My Zsh, Starship, Powerlevel10k, etc.) display correctly

### Bug Fixes

- **Terminal prompt not appearing** — fixed a race condition where the shell's initial prompt output could be buffered and dropped before the terminal session ID was established; output is now queued and flushed once the IPC handshake completes
- **Terminal crash on missing folder** — fixed a crash (exit code 1, zero output) when the session restored a folder path that no longer existed on disk; cwd is now validated with `fs.existsSync` before being passed to node-pty, falling back to the home directory
- **Settings covered by toolbar** — settings and help overlays were behind the toolbar (`z-index: 200` vs `1000`); raised to `2000` so they correctly cover the full content area including toolbar buttons
- **No way to close settings** — settings panel now closes on Escape key, clicking the backdrop, and `Cmd+,` toggles it (open → close → open)
- **Activity bar border through traffic lights** — replaced full-height `border-right` with a `::after` pseudo-element that starts below the 52 px traffic-light spacer
- **Full-screen terminal blocks file open** — opening a file while the terminal is maximized now automatically restores it to its normal partial height so the editor is visible

### Architecture

- **Output buffering in terminal sessions** — `createTerminalSession` now buffers `terminal-output` IPC events received before the session ID is known and flushes them immediately after `terminal.create` resolves
- **Sidebar panels system** — sidebar is now composed of named panels (`panel-home`, `panel-files`, `panel-folders`, `panel-git`) toggled by `setActiveActivity()`; replaces the previous single-view sidebar
- **`resolveShellEnv` in main process** — spawns a login shell at startup to capture the full user environment; result is used for all subsequent PTY spawns

---

## [1.3.0] — 2026-05-18

### Bug Fixes

- **Tab dot colors** — active tab shows blue dot, unsaved changes show red dot, inactive tabs show gray dot; dot hides on hover to reveal close button
- **Splash screen persistence** — splash now stays visible until the user actively interacts (opens a file, clicks a button, etc.) instead of auto-dismissing after a timeout
- **Red dot on file open** — opening a file from Finder no longer briefly marks the tab as modified; a `_loading` flag suppresses the spurious CodeMirror `change` event fired during `setValue`
- **Close last file behavior** — closing the last open tab now correctly shows the splash screen in the editor area; if another tab exists it loads immediately
- **Preview clears on last tab close** — closing the final tab now clears the preview panel instead of leaving stale content
- **Splash with terminal open** — splash screen now appears correctly above the editor area even when the terminal panel is open below; terminal remains fully interactive
- **Sidebar auto-hide on splash** — sidebar hides automatically when the launch splash is shown with no open files and no terminal; it restores when a file is opened
- **Sidebar stays with terminal open** — when the terminal is visible, the sidebar does not auto-hide when the last file is closed
- **Recent files on first launch** — the recent files list now populates correctly on the initial splash screen (was blank due to settings loading after splash render)
- **HTML preview via blob URL** — HTML file preview now works reliably using blob URLs, bypassing Chromium's cross-origin restrictions for `file://` paths in iframes
- **Files always open in editor mode** — opening a file from Finder or the splash screen now defaults to editor view instead of inheriting the previous split/preview state
- **Terminal un-maximize text overflow** — restoring the terminal from maximized now correctly fits the terminal content; added a secondary `setTimeout` fit pass after `requestAnimationFrame` to handle the layout reflow timing
- **Settings crash fix** — removed stale element IDs (`setting-minimap`, `btn-terminal-new`, `btn-terminal-close`) from the settings binding loop that caused a `TypeError: Cannot set properties of null` when opening Settings

### Architecture

- **Splash inside editor panel** — moved `#splash-screen` from body-level `position:fixed` into `#panels` as `position:absolute` so it does not overlap the terminal region
- **`splashLocked` flag** — global flag in `globals.js` that keeps the splash visible until the first meaningful user interaction, replacing the removed 400ms auto-dismiss timer
- **`_loading` flag in EditorManager** — suppresses the CodeMirror `change` event during programmatic `setValue` calls to prevent false modified state on tab load
- **`_restoring` flag in renderer** — distinguishes session-restore file opens from user-initiated opens so view mode and splash state are not altered during startup

---

## [1.2.1] — 2026-05-17

### New Features

- **Nerd Font support** — added JetBrainsMono, FiraCode, and CascadiaCode Nerd Font options to Editor and Terminal settings for modern developer icons
- **Dynamic Terminal Tabs** — tabs now update in real-time to show the current directory name (e.g., `codeview`) while keeping the interface clean

### Bug Fixes

- **Maximized Terminal Isolation** — UI elements (icons, sidebar) are now completely hidden when the terminal is maximized, providing a distraction-free environment
- **Toolbar Dragging** — main toolbar is now always on top and draggable, even when the terminal is maximized
- **Build Integrity** — fixed a critical issue where modular JS files and the `marked` dependency were missing from the production build

### Architecture

- **Globals Module** — introduced `globals.js` to provide a robust, single source of truth for global state and DOM references

---

## [1.2.0] — 2026-05-17

### New Features

- **Git Integration** — visual status indicators in the sidebar (Modified, Untracked, Added) that update in real-time
- **Git Branch Indicator** — current branch name displayed prominently in the toolbar center
- **Terminal UI Overhaul** — relocated terminal tabs to the bottom with a modern active state (subtle highlight + color dot indicator)
- **Apple Silicon Native Support** — updated build scripts to dynamically target the current architecture (arm64/x64), eliminating Rosetta requirements on M-series Macs

### Architecture (The "Great Refactoring")

- **Complete Modularization** — extracted the monolithic `renderer.js` into focused modules:
    - `terminal.js` (xterm/PTY orchestration)
    - `file-tree.js` (sidebar/directory logic)
    - `git.js` (git status/branch IPC logic)
    - `tabs.js` (tab state/rendering)
    - `editor-manager.js` (CodeMirror configuration)
    - `preview.js` (Markdown/HTML/JSON rendering)
    - `settings.js` (Preferences UI/logic)
    - `icons.js` (Centralized SVG library)

### Bug Fixes

- **HTML Preview** — fixed relative asset resolution using `<base>` tag injection and enabled instant live updates via `srcdoc`
- **Splash Screen** — fixed issue where the splash screen was hidden during app initialization; it now shows immediately on launch
- **Maximized Terminal** — adjusted layout to correctly clear macOS traffic lights when the terminal is in full-panel mode

---

## [1.1.0] — 2026-05-16

### New Features

- **Kaku theme** — custom dark editor theme (deep navy background, catppuccin-inspired syntax palette) available in both editor and terminal syntax color settings
- **Terminal syntax color themes** — six ANSI palettes (Apple Dark, Kaku, Dracula, Nord, Solarized Dark, One Dark); only changes syntax colors, terminal background always matches editor background
- **Sidebar toggle in toolbar** — always-visible sidebar toggle button in the main toolbar; clicking collapses/uncollapses sidebar without needing a keyboard shortcut
- **Inline terminal + button** — new terminal tab button sits immediately after the last tab and moves as tabs are added
- **Home directory exposure** — `api.getHomeDir()` added to IPC bridge for safe home path resolution in the renderer

### Bug Fixes

- **HTML preview** — switched from `srcdoc` (null origin, relative resources broken) to `file://` src so local HTML files load with correct origin; preview now also refreshes when switching view modes
- **Splash screen** — `process.env.HOME` is not available in the context-isolated renderer; replaced with `api.getHomeDir()` which was crashing `updateSplashScreen()` and preventing the splash from ever appearing; z-index raised to 200 so nothing can overlap it
- **Window dragging** — `-webkit-app-region: drag` added to toolbar and sidebar header; interactive children marked `no-drag`
- **Traffic lights overlap (sidebar hidden)** — toolbar gains `padding-left: 76px` via `#app.sidebar-hidden` class when sidebar is collapsed
- **Traffic lights overlap (terminal maximized)** — maximized terminal titlebar gains `padding-left: 76px` so first tab clears traffic lights
- **Terminal background** — terminal background (canvas + UI chrome) now matches `--editor-bg` exactly in both light and dark modes
- **Terminal resize handle / border** — resize handle and titlebar background now use `--terminal-bg` (= `--editor-bg`) instead of a separate darker color
- **Sidebar layout** — folder tree was being pushed to the bottom of the sidebar; fixed with `flex: 0 0 auto / max-height: 40%` on the tabs section and `flex: 1 / min-height: 0` on the folder tree
- **Active tab bold** — explicit `font-weight: 600` on `.tab.active .tab-name` so the active sidebar tab is visibly bold
- **Tab font size** — sidebar file tabs increased from 12.5px to 14px

### UI / Polish

- Removed border under main toolbar
- Removed border under terminal tab bar
- Removed backdrop blur shadow from toolbar
- Removed redundant collapse sidebar button from sidebar action bar (toolbar toggle replaces it)
- Add-file and add-folder sidebar icons are now visually distinct
- Terminal syntax color select label renamed from "Terminal Theme" to "Syntax Color"

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
