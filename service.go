package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// CodeView is the service bound to the frontend. Every exported method is
// callable from JS as "main.CodeView.<Method>" (see bridge.js).
type CodeView struct {
	terminals *terminalManager
}

// ─── Files ───────────────────────────────────────────────────────────────────

type ReadFileResult struct {
	Success  bool   `json:"success"`
	Content  string `json:"content,omitempty"`
	Type     string `json:"type,omitempty"`
	FilePath string `json:"filePath,omitempty"`
	Error    string `json:"error,omitempty"`
}

type Result struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

func (s *CodeView) ReadFile(path string) ReadFileResult {
	b, err := os.ReadFile(path)
	if err != nil {
		return ReadFileResult{Error: err.Error()}
	}
	return ReadFileResult{Success: true, Content: string(b), Type: fileType(path), FilePath: path}
}

func (s *CodeView) WriteFile(path, content string) Result {
	mode := os.FileMode(0o644)
	if st, err := os.Stat(path); err == nil {
		mode = st.Mode().Perm() // keep e.g. +x on shell scripts
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		return Result{Error: err.Error()}
	}
	return Result{Success: true}
}

type DirEntry struct {
	Name        string `json:"name"`
	IsDirectory bool   `json:"isDirectory"`
	Path        string `json:"path"`
}

func (s *CodeView) ReadDir(dir string) []DirEntry {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []DirEntry{}
	}
	out := make([]DirEntry, 0, len(entries))
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		isDir := e.IsDir()
		if e.Type()&os.ModeSymlink != 0 {
			if st, err := os.Stat(filepath.Join(dir, e.Name())); err == nil {
				isDir = st.IsDir()
			}
		}
		out = append(out, DirEntry{Name: e.Name(), IsDirectory: isDir, Path: filepath.Join(dir, e.Name())})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].IsDirectory != out[j].IsDirectory {
			return out[i].IsDirectory
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

func fileType(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown":
		return "markdown"
	case ".json":
		return "json"
	case ".html", ".htm":
		return "html"
	case ".js", ".mjs", ".cjs", ".ts", ".tsx":
		return "javascript"
	case ".py":
		return "python"
	case ".yaml", ".yml":
		return "yaml"
	case ".sh", ".bash", ".zsh":
		return "shell"
	}
	return "text"
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

var fileFilters = [][2]string{
	{"Markdown", "*.md;*.markdown"},
	{"JSON", "*.json"},
	{"HTML", "*.html;*.htm"},
	{"JavaScript / TypeScript", "*.js;*.mjs;*.cjs;*.ts;*.tsx"},
	{"Python", "*.py"},
	{"YAML", "*.yaml;*.yml"},
	{"Shell Scripts", "*.sh;*.bash;*.zsh"},
	{"Plain Text", "*.txt"},
	{"All Files", "*"},
}

func (s *CodeView) ShowOpenDialog() string {
	d := app.Dialog.OpenFile().CanChooseFiles(true).CanChooseDirectories(false)
	d.AddFilter("Code & Text Files", "*.md;*.markdown;*.json;*.html;*.htm;*.js;*.mjs;*.cjs;*.ts;*.tsx;*.py;*.yaml;*.yml;*.sh;*.bash;*.zsh;*.txt")
	for _, f := range fileFilters {
		d.AddFilter(f[0], f[1])
	}
	if mainWindow != nil {
		d.AttachToWindow(mainWindow)
	}
	p, _ := d.PromptForSingleSelection()
	return p
}

func (s *CodeView) ShowFolderDialog() string {
	d := app.Dialog.OpenFile().CanChooseFiles(false).CanChooseDirectories(true).CanCreateDirectories(true)
	if mainWindow != nil {
		d.AttachToWindow(mainWindow)
	}
	p, _ := d.PromptForSingleSelection()
	return p
}

func (s *CodeView) ShowSaveDialog(defaultName string) string {
	if defaultName == "" {
		defaultName = "untitled.md"
	}
	d := app.Dialog.SaveFile().SetFilename(defaultName)
	for _, f := range fileFilters {
		d.AddFilter(f[0], f[1])
	}
	if mainWindow != nil {
		d.AttachToWindow(mainWindow)
	}
	p, _ := d.PromptForSingleSelection()
	return p
}

// ShowMessage replaces window.alert, which WKWebView does not implement.
func (s *CodeView) ShowMessage(title, message string) {
	d := app.Dialog.Warning().SetTitle(title).SetMessage(message)
	if mainWindow != nil {
		d.AttachToWindow(mainWindow)
	}
	d.Show()
}

// AskSaveChanges replaces window.confirm for the unsaved-changes prompt.
// Returns "save", "discard" or "cancel".
func (s *CodeView) AskSaveChanges(name string) string {
	choice := make(chan string, 1)
	d := app.Dialog.Question().
		SetTitle("Save changes to “" + name + "”?").
		SetMessage("Your changes will be lost if you don't save them.")
	save := d.AddButton("Save").OnClick(func() { choice <- "save" })
	d.AddButton("Don't Save").OnClick(func() { choice <- "discard" })
	cancel := d.AddButton("Cancel").OnClick(func() { choice <- "cancel" })
	d.SetDefaultButton(save).SetCancelButton(cancel)
	if mainWindow != nil {
		d.AttachToWindow(mainWindow)
	}
	d.Show()
	select {
	case c := <-choice:
		return c
	case <-time.After(10 * time.Minute):
		return "cancel"
	}
}

// ─── Settings & session ──────────────────────────────────────────────────────

func dataDir() string {
	base, err := os.UserConfigDir() // ~/Library/Application Support — same place Electron used
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "CodeView")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func (s *CodeView) GetSettings() map[string]any {
	var m map[string]any
	if b, err := os.ReadFile(filepath.Join(dataDir(), "settings.json")); err == nil && json.Unmarshal(b, &m) == nil {
		return m
	}
	return map[string]any{
		"theme": "system", "fontFamily": "SF Mono", "fontSize": 14,
		"lineNumbers": true, "restoreSession": true, "syncScroll": true,
	}
}

func (s *CodeView) SetSettings(settings map[string]any) Result {
	return writeJSON(filepath.Join(dataDir(), "settings.json"), settings)
}

func (s *CodeView) GetSession() map[string]any {
	var m map[string]any
	b, err := os.ReadFile(filepath.Join(dataDir(), "session.json"))
	if err != nil || json.Unmarshal(b, &m) != nil || m == nil {
		return nil
	}
	if fp, ok := m["folderPath"]; ok && m["openFolders"] == nil { // legacy single-folder sessions
		m["openFolders"] = []any{fp}
		delete(m, "folderPath")
	}
	if m["openFolders"] == nil {
		m["openFolders"] = []any{}
	}
	return m
}

func (s *CodeView) SaveSession(session map[string]any) Result {
	if session == nil {
		session = map[string]any{}
	}
	if session["openFolders"] == nil {
		session["openFolders"] = []any{}
	}
	return writeJSON(filepath.Join(dataDir(), "session.json"), session)
}

// writeJSON writes atomically so a crash mid-write can't truncate settings.
func writeJSON(path string, v any) Result {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return Result{Error: err.Error()}
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return Result{Error: err.Error()}
	}
	if err := os.Rename(tmp, path); err != nil {
		return Result{Error: err.Error()}
	}
	return Result{Success: true}
}

// ─── Window / system ─────────────────────────────────────────────────────────

func (s *CodeView) GetTheme() string { return themeName() }

// TrafficLightsInset is the x position (CSS px) where the window buttons end.
func (s *CodeView) TrafficLightsInset() float64 {
	if mainWindow == nil {
		return 0
	}
	return trafficLightsRightEdge(mainWindow)
}

func (s *CodeView) GetHomeDir() string {
	h, _ := os.UserHomeDir()
	return h
}

func (s *CodeView) SetTitle(title string) {
	if mainWindow != nil {
		mainWindow.SetTitle(title)
	}
}

func (s *CodeView) ShowInFinder(path string) {
	_ = app.Env.OpenFileManager(path, true)
}

func (s *CodeView) OpenExternal(url string) {
	if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") || strings.HasPrefix(url, "mailto:") {
		_ = app.Browser.OpenURL(url)
	}
}

// FrontendReady is called once the renderer subscribes to open-external-file;
// it returns any files Finder asked us to open before that point.
func (s *CodeView) FrontendReady() []string {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	frontendUp = true
	files := pendingFiles
	pendingFiles = nil
	if files == nil {
		files = []string{}
	}
	return files
}

type UpdateInfo struct {
	Current string  `json:"current"`
	Latest  *string `json:"latest"`
	URL     *string `json:"url"`
	Error   string  `json:"error,omitempty"`
}

func (s *CodeView) CheckForUpdates() UpdateInfo {
	info := UpdateInfo{Current: version}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/repos/dkeg/codeview/releases/latest", nil)
	req.Header.Set("User-Agent", "CodeView-App")
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			info.Error = "Timed out"
		} else {
			info.Error = err.Error()
		}
		return info
	}
	defer resp.Body.Close()
	var rel struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil || rel.TagName == "" {
		info.Error = "Failed to parse response"
		return info
	}
	latest := strings.TrimPrefix(rel.TagName, "v")
	info.Latest, info.URL = &latest, &rel.HTMLURL
	return info
}

// ─── Terminal ────────────────────────────────────────────────────────────────

func (s *CodeView) TerminalCreate(cwd string, cols, rows int) (int, error) {
	return s.terminals.create(cwd, cols, rows)
}
func (s *CodeView) TerminalInput(id int, data string)     { s.terminals.write(id, data) }
func (s *CodeView) TerminalResize(id int, cols, rows int) { s.terminals.resize(id, cols, rows) }
func (s *CodeView) TerminalKill(id int) Result            { s.terminals.kill(id); return Result{Success: true} }
