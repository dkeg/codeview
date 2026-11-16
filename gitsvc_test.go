package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestMain(m *testing.M) {
	resolveShellEnv()
	os.Exit(m.Run())
}

func sh(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %v\n%s", args, err, out)
	}
}

func write(t *testing.T, path, s string) {
	t.Helper()
	os.MkdirAll(filepath.Dir(path), 0o755)
	if err := os.WriteFile(path, []byte(s), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestGitStatus(t *testing.T) {
	repo := t.TempDir() // on macOS this is under a /var -> /private/var symlink
	sh(t, repo, "git", "init", "-q", "-b", "main")
	write(t, filepath.Join(repo, "top.md"), "a")
	write(t, filepath.Join(repo, "sub", "keep.md"), "a")
	write(t, filepath.Join(repo, "sub", "deep", "edit me.md"), "a")
	write(t, filepath.Join(repo, "sub", "old.md"), "a")
	write(t, filepath.Join(repo, "sub", "gone.md"), "a")
	sh(t, repo, "git", "add", "-A")
	sh(t, repo, "git", "commit", "-qm", "init")

	write(t, filepath.Join(repo, "top.md"), "b")
	write(t, filepath.Join(repo, "sub", "deep", "edit me.md"), "b") // space in name
	write(t, filepath.Join(repo, "sub", "new ✨.md"), "new")         // unicode, untracked
	os.Remove(filepath.Join(repo, "sub", "gone.md"))
	sh(t, repo, "git", "mv", "sub/old.md", "sub/renamed.md")

	s := &CodeView{}

	// Opened folder is a SUBDIRECTORY of the repo — the case the Electron build got wrong.
	res := s.GetGitStatus(filepath.Join(repo, "sub"))
	if !res.Success {
		t.Fatalf("status failed: %s", res.Error)
	}
	if res.Branch != "main" {
		t.Errorf("branch = %q", res.Branch)
	}
	want := map[string]string{
		"deep/edit me.md": "M",
		"deep":            "M", // rolled up to the parent dir
		"new ✨.md":        "??",
		"renamed.md":      "R",
		"gone.md":         "D",
	}
	for k, v := range want {
		if res.Status[k] != v {
			t.Errorf("status[%q] = %q, want %q (all: %v)", k, res.Status[k], v, res.Status)
		}
	}
	if _, ok := res.Status["top.md"]; ok {
		t.Errorf("file outside opened folder leaked into status: %v", res.Status)
	}
	if _, ok := res.Status["../top.md"]; ok {
		t.Errorf("file outside opened folder leaked into status: %v", res.Status)
	}
	for _, c := range res.Changes {
		if c.Path == "renamed.md" && c.OrigPath != "sub/old.md" {
			t.Errorf("rename origPath = %q", c.OrigPath)
		}
		if c.Path == "renamed.md" && c.Index != "R" {
			t.Errorf("rename should be staged, index = %q", c.Index)
		}
	}

	// From the repo root, the top-level file shows and sub rolls up.
	root := s.GetGitStatus(repo)
	if root.Status["top.md"] != "M" || root.Status["sub"] == "" {
		t.Errorf("root status wrong: %v", root.Status)
	}

	// Not a repo
	if r := s.GetGitStatus(t.TempDir()); r.Success {
		t.Errorf("expected failure outside a repo")
	}

	// Detached HEAD
	sh(t, repo, "git", "stash", "-u", "-q")
	sh(t, repo, "git", "checkout", "-q", "--detach")
	if r := s.GetGitStatus(repo); !r.Detached || len(r.Branch) != 7 {
		t.Errorf("detached: %+v", r)
	}
}

func TestValidUTF8Prefix(t *testing.T) {
	b := []byte("ok ✨") // ✨ is 3 bytes
	for cut := 1; cut <= 3; cut++ {
		chunk := b[:len(b)-cut]
		if got := validUTF8Prefix(chunk); got != len("ok ") && cut < 3 {
			t.Errorf("cut %d: got %d", cut, got)
		}
	}
	if validUTF8Prefix(b) != len(b) {
		t.Errorf("full string should be complete")
	}
	if validUTF8Prefix([]byte("abc")) != 3 {
		t.Errorf("ascii")
	}
}
