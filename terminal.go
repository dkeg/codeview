package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/creack/pty"
)

// ─── Login-shell environment ─────────────────────────────────────────────────
// Apps launched from Finder get launchd's minimal PATH (/usr/bin:/bin:…), so
// Homebrew tools like gh wouldn't be found. Resolve the user's login env once.

var (
	shellEnvOnce  sync.Once
	shellEnvReady = make(chan struct{})
	shellEnv      []string
)

func userShell() string {
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	return "/bin/zsh"
}

func resolveShellEnv() {
	shellEnvOnce.Do(func() {
		defer close(shellEnvReady)
		shellEnv = os.Environ()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, userShell(), "-l", "-c", "env").Output()
		if err != nil || len(strings.TrimSpace(string(out))) == 0 {
			return
		}
		merged := map[string]string{}
		for _, kv := range os.Environ() {
			if k, v, ok := strings.Cut(kv, "="); ok {
				merged[k] = v
			}
		}
		for _, line := range strings.Split(string(out), "\n") {
			if k, v, ok := strings.Cut(line, "="); ok && k != "" && !strings.ContainsAny(k, " \t") {
				merged[k] = v
			}
		}
		shellEnv = shellEnv[:0]
		for k, v := range merged {
			shellEnv = append(shellEnv, k+"="+v)
		}
		// Let exec.LookPath (git, gh) see the same PATH the user's shell does.
		if p := merged["PATH"]; p != "" {
			os.Setenv("PATH", p)
		}
	})
}

// loginEnv waits briefly for the resolved environment, falling back to ours.
func loginEnv() []string {
	select {
	case <-shellEnvReady:
		return shellEnv
	case <-time.After(6 * time.Second):
		return os.Environ()
	}
}

func envGet(env []string, key string) string {
	for _, kv := range env {
		if k, v, ok := strings.Cut(kv, "="); ok && k == key {
			return v
		}
	}
	return ""
}

func envSet(env []string, key, val string) []string {
	out := make([]string, 0, len(env)+1)
	for _, kv := range env {
		if !strings.HasPrefix(kv, key+"=") {
			out = append(out, kv)
		}
	}
	return append(out, key+"="+val)
}

// ─── PTY sessions ────────────────────────────────────────────────────────────

type terminal struct {
	cmd *exec.Cmd
	pty *os.File
}

type terminalManager struct {
	mu     sync.Mutex
	nextID int
	terms  map[int]*terminal
}

func newTerminalManager() *terminalManager {
	return &terminalManager{nextID: 1, terms: map[int]*terminal{}}
}

type termOutput struct {
	ID   int    `json:"id"`
	Data string `json:"data"`
}

func (m *terminalManager) create(cwd string, cols, rows int) (int, error) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	// node-pty exited with code 1 and no output when cwd didn't exist; same here.
	if st, err := os.Stat(cwd); cwd == "" || err != nil || !st.IsDir() {
		cwd, _ = os.UserHomeDir()
	}

	env := loginEnv()
	env = envSet(env, "TERM", "xterm-256color")
	env = envSet(env, "COLORTERM", "truecolor")
	env = envSet(env, "TERM_PROGRAM", "CodeView")
	if envGet(env, "LANG") == "" {
		env = envSet(env, "LANG", "en_US.UTF-8")
	}

	// -l -i so .zshrc (prompt themes etc.) is sourced, not just .zprofile.
	cmd := exec.Command(userShell(), "-l", "-i")
	cmd.Dir = cwd
	cmd.Env = env
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return 0, fmt.Errorf("could not start shell: %w", err)
	}

	m.mu.Lock()
	id := m.nextID
	m.nextID++
	m.terms[id] = &terminal{cmd: cmd, pty: f}
	m.mu.Unlock()

	go m.pump(id, f)
	go func() {
		_ = cmd.Wait()
		m.mu.Lock()
		delete(m.terms, id)
		m.mu.Unlock()
		_ = f.Close()
		app.Event.Emit("terminal-exit", id)
	}()
	return id, nil
}

// pump streams PTY output to the frontend. Reads can split a multi-byte UTF-8
// sequence; hold back the incomplete tail so it isn't mangled into U+FFFD.
func (m *terminalManager) pump(id int, f *os.File) {
	buf := make([]byte, 64*1024)
	var carry []byte
	for {
		n, err := f.Read(buf)
		if n > 0 {
			chunk := append(carry, buf[:n]...)
			cut := validUTF8Prefix(chunk)
			carry = append([]byte(nil), chunk[cut:]...)
			if cut > 0 {
				app.Event.Emit("terminal-output", termOutput{ID: id, Data: string(chunk[:cut])})
			}
		}
		if err != nil {
			if len(carry) > 0 {
				app.Event.Emit("terminal-output", termOutput{ID: id, Data: string(carry)})
			}
			return
		}
	}
}

// validUTF8Prefix returns the length of b minus any trailing, incomplete rune.
func validUTF8Prefix(b []byte) int {
	for i := len(b) - 1; i >= 0 && i >= len(b)-utf8.UTFMax; i-- {
		if utf8.RuneStart(b[i]) {
			if !utf8.FullRune(b[i:]) {
				return i
			}
			break
		}
	}
	return len(b)
}

func (m *terminalManager) get(id int) *terminal {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.terms[id]
}

func (m *terminalManager) write(id int, data string) {
	if t := m.get(id); t != nil {
		_, _ = t.pty.Write([]byte(data))
	}
}

func (m *terminalManager) resize(id, cols, rows int) {
	if t := m.get(id); t != nil && cols > 0 && rows > 0 {
		_ = pty.Setsize(t.pty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	}
}

func (m *terminalManager) kill(id int) {
	m.mu.Lock()
	t := m.terms[id]
	delete(m.terms, id)
	m.mu.Unlock()
	if t != nil && t.cmd.Process != nil {
		// Signal the whole process group so jobs started in the shell go too.
		_ = syscall.Kill(-t.cmd.Process.Pid, syscall.SIGHUP)
		_ = t.cmd.Process.Signal(syscall.SIGHUP)
	}
}

func (m *terminalManager) killAll() {
	m.mu.Lock()
	ids := make([]int, 0, len(m.terms))
	for id := range m.terms {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		m.kill(id)
	}
}
