package main

import (
	"embed"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// version is overridden at build time via -ldflags "-X main.version=x.y.z".
var version = "dev"

// Frontend assets. The UI is plain HTML/JS loaded straight from the repo root;
// third-party libraries are served from node_modules (run `npm ci` first).
//
//go:embed index.html styles.css bridge.js globals.js icons.js terminal.js git.js file-tree.js settings.js tabs.js editor-manager.js preview.js editor-commands.js renderer.js
//go:embed assets/theme-kaku.css
//go:embed node_modules/codemirror/lib node_modules/codemirror/mode node_modules/codemirror/addon node_modules/codemirror/theme
//go:embed node_modules/@xterm/xterm/lib node_modules/@xterm/xterm/css
//go:embed node_modules/@xterm/addon-fit/lib node_modules/@xterm/addon-web-links/lib node_modules/@xterm/addon-unicode11/lib
//go:embed node_modules/mermaid/dist/mermaid.min.js node_modules/marked/marked.min.js
//go:embed node_modules/@highlightjs/cdn-assets/highlight.min.js
var assets embed.FS

var (
	app        *application.App
	mainWindow *application.WebviewWindow

	// Files opened from Finder before the frontend has subscribed to them.
	pendingMu    sync.Mutex
	pendingFiles []string
	frontendUp   bool
)

func main() {
	go resolveShellEnv()

	svc := &CodeView{terminals: newTerminalManager()}

	app = application.New(application.Options{
		Name:        "CodeView",
		Description: "A native macOS code and markdown editor with integrated terminal",
		Services:    []application.Service{application.NewService(svc)},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: localImageMiddleware,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		OnShutdown: svc.terminals.killAll,
	})

	app.Event.OnApplicationEvent(events.Common.ApplicationOpenedWithFile, func(e *application.ApplicationEvent) {
		if f := e.Context().Filename(); f != "" {
			openExternalFile(f)
		}
	})
	app.Event.OnApplicationEvent(events.Common.ThemeChanged, func(e *application.ApplicationEvent) {
		app.Event.Emit("theme-updated", themeName())
	})
	// Re-open the window when the dock icon is clicked after it was closed.
	app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(e *application.ApplicationEvent) {
		if mainWindow == nil {
			createWindow()
		} else {
			mainWindow.Show().Focus()
		}
	})

	app.Menu.SetApplicationMenu(buildMenu())
	createWindow()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func createWindow() {
	mainWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "CodeView",
		Width:            1280,
		Height:           800,
		MinWidth:         620,
		MinHeight:        400,
		URL:              "/",
		BackgroundType:   application.BackgroundTypeTranslucent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHidden,
		},
	})
	// Drag regions come from --wails-draggable in styles.css.
	positionTrafficLights(mainWindow)
	mainWindow.OnWindowEvent(events.Common.WindowClosing, func(e *application.WindowEvent) {
		pendingMu.Lock()
		frontendUp = false
		pendingMu.Unlock()
		mainWindow = nil
	})
}

func openExternalFile(path string) {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	if frontendUp {
		app.Event.Emit("open-external-file", path)
		return
	}
	pendingFiles = append(pendingFiles, path)
	if mainWindow == nil && app != nil {
		go application.InvokeSync(createWindow)
	}
}

// localImageMiddleware serves files next to the open document so relative
// <img src> in markdown previews and CSS/JS/images in HTML previews work:
// /_localfile/<absolute path>. Limited to web asset types.
func localImageMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := strings.CutPrefix(r.URL.Path, "/_localfile")
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		switch strings.ToLower(filepath.Ext(p)) {
		case ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp", ".ico",
			".css", ".js", ".mjs", ".json", ".woff", ".woff2", ".ttf", ".otf",
			".mp4", ".webm", ".mp3", ".wav", ".ogg":
			http.ServeFile(w, r, filepath.Clean(p))
		default:
			http.Error(w, "forbidden", http.StatusForbidden)
		}
	})
}

func themeName() string {
	if app.Env.IsDarkMode() {
		return "dark"
	}
	return "light"
}

func emit(name string) func(*application.Context) {
	return func(*application.Context) { app.Event.Emit(name) }
}

func emitWith(name string, data any) func(*application.Context) {
	return func(*application.Context) { app.Event.Emit(name, data) }
}

func buildMenu() *application.Menu {
	menu := application.NewMenu()

	appMenu := menu.AddSubmenu("CodeView")
	appMenu.AddRole(application.About)
	appMenu.AddSeparator()
	appMenu.Add("Settings…").SetAccelerator("CmdOrCtrl+,").OnClick(emit("open-settings"))
	appMenu.AddSeparator()
	appMenu.AddRole(application.ServicesMenu)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Hide)
	appMenu.AddRole(application.HideOthers)
	appMenu.AddRole(application.UnHide)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Quit)

	file := menu.AddSubmenu("File")
	file.Add("New File").SetAccelerator("CmdOrCtrl+N").OnClick(emit("menu-new-file"))
	file.AddSeparator()
	file.Add("Open…").SetAccelerator("CmdOrCtrl+O").OnClick(emit("menu-open-file"))
	file.Add("Open Folder…").SetAccelerator("CmdOrCtrl+Shift+O").OnClick(emit("menu-open-folder"))
	file.AddSeparator()
	file.Add("Save").SetAccelerator("CmdOrCtrl+S").OnClick(emit("menu-save"))
	file.Add("Save As…").SetAccelerator("CmdOrCtrl+Shift+S").OnClick(emit("menu-save-as"))
	file.AddSeparator()
	file.Add("Close Tab").SetAccelerator("CmdOrCtrl+W").OnClick(emit("menu-close-tab"))

	edit := menu.AddSubmenu("Edit")
	edit.AddRole(application.Undo)
	edit.AddRole(application.Redo)
	edit.AddSeparator()
	edit.AddRole(application.Cut)
	edit.AddRole(application.Copy)
	edit.AddRole(application.Paste)
	edit.AddRole(application.SelectAll)

	view := menu.AddSubmenu("View")
	view.Add("Editor Only").SetAccelerator("CmdOrCtrl+1").OnClick(emitWith("menu-view-mode", "editor"))
	view.Add("Split View").SetAccelerator("CmdOrCtrl+2").OnClick(emitWith("menu-view-mode", "split"))
	view.Add("Toggle Terminal (Horizontal Split)").OnClick(emitWith("menu-view-mode", "hsplit"))
	view.Add("Toggle Terminal (Right Side)").OnClick(emitWith("menu-view-mode", "vsplit"))
	view.Add("Preview Only").SetAccelerator("CmdOrCtrl+3").OnClick(emitWith("menu-view-mode", "preview"))
	view.AddSeparator()
	view.Add("Cycle View Mode").SetAccelerator("CmdOrCtrl+Shift+P").OnClick(emit("menu-cycle-view"))
	view.AddSeparator()
	view.Add("Toggle Sidebar").SetAccelerator("CmdOrCtrl+B").OnClick(emit("menu-toggle-sidebar"))
	view.Add("Toggle Terminal").SetAccelerator("CmdOrCtrl+`").OnClick(emit("menu-toggle-terminal"))
	view.Add("Show Git Panel").SetAccelerator("CmdOrCtrl+Shift+G").OnClick(emit("menu-show-git"))
	view.AddSeparator()
	view.AddRole(application.Reload)
	view.AddRole(application.OpenDevTools)

	win := menu.AddSubmenu("Window")
	win.AddRole(application.Minimise)
	win.AddRole(application.Zoom)
	win.AddSeparator()
	win.AddRole(application.BringAllToFront)

	return menu
}
