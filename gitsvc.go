package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func runIn(dir string, timeout time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Env = append(loginEnv(), "GIT_OPTIONAL_LOCKS=0", "GH_PROMPT_DISABLED=1", "NO_COLOR=1")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			msg = name + " timed out"
		}
		if msg == "" {
			msg = err.Error()
		}
		return out, errors.New(msg)
	}
	return out, nil
}

func git(dir string, args ...string) ([]byte, error) {
	return runIn(dir, 10*time.Second, "git", args...)
}

// ─── Status ──────────────────────────────────────────────────────────────────

type GitChange struct {
	Path     string `json:"path"` // relative to the opened folder
	AbsPath  string `json:"absPath"`
	OrigPath string `json:"origPath,omitempty"`
	Index    string `json:"index"`    // staged status letter, "." if none
	Worktree string `json:"worktree"` // unstaged status letter, "." if none
	Kind     string `json:"kind"`     // modified|added|deleted|renamed|untracked|conflict
}

type GitStatusResult struct {
	Success  bool              `json:"success"`
	Error    string            `json:"error,omitempty"`
	Root     string            `json:"root,omitempty"`
	Branch   string            `json:"branch,omitempty"`
	Detached bool              `json:"detached,omitempty"`
	Upstream string            `json:"upstream,omitempty"`
	Ahead    int               `json:"ahead"`
	Behind   int               `json:"behind"`
	Status   map[string]string `json:"status"` // folder-relative path (files + parent dirs) -> code
	Changes  []GitChange       `json:"changes"`
}

// GetGitStatus reports status for dir, which may be a subfolder of a repo.
//
// Fixes vs. the Electron version: paths were repo-root-relative so nothing
// matched when a subfolder was opened; paths with spaces/unicode came back
// quoted; parent directories never showed that they contained changes.
func (s *CodeView) GetGitStatus(dir string) GitStatusResult {
	rootOut, err := git(dir, "rev-parse", "--show-toplevel")
	if err != nil {
		return GitStatusResult{Error: err.Error(), Status: map[string]string{}, Changes: []GitChange{}}
	}
	root := strings.TrimSpace(string(rootOut))

	out, err := git(dir, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all")
	if err != nil {
		return GitStatusResult{Error: err.Error(), Status: map[string]string{}, Changes: []GitChange{}}
	}

	res := GitStatusResult{Success: true, Root: root, Status: map[string]string{}, Changes: []GitChange{}}
	base := realPath(dir)
	rootReal := realPath(root)

	recs := strings.Split(string(out), "\x00")
	for i := 0; i < len(recs); i++ {
		rec := recs[i]
		if rec == "" {
			continue
		}
		switch rec[0] {
		case '#':
			parseBranchHeader(rec, &res)
		case '1', '2', 'u', '?':
			var xy, path, orig string
			switch rec[0] {
			case '1': // 1 XY sub mH mI mW hH hI path
				f := strings.SplitN(rec, " ", 9)
				if len(f) < 9 {
					continue
				}
				xy, path = f[1], f[8]
			case '2': // 2 XY sub mH mI mW hH hI Xscore path \0 origPath
				f := strings.SplitN(rec, " ", 10)
				if len(f) < 10 {
					continue
				}
				xy, path = f[1], f[9]
				if i+1 < len(recs) {
					orig = recs[i+1]
					i++
				}
			case 'u': // u XY sub m1 m2 m3 mW h1 h2 h3 path
				f := strings.SplitN(rec, " ", 11)
				if len(f) < 11 {
					continue
				}
				xy, path = "UU", f[10]
			case '?':
				xy, path = "??", rec[2:]
			}

			abs := filepath.Join(rootReal, path)
			rel, err := filepath.Rel(base, abs)
			if err != nil || rel == ".." || strings.HasPrefix(rel, "../") {
				continue // outside the opened folder
			}
			c := GitChange{Path: rel, AbsPath: abs, Index: xy[:1], Worktree: xy[1:2], Kind: changeKind(rec[0], xy)}
			if orig != "" {
				c.OrigPath = orig
			}
			res.Changes = append(res.Changes, c)
			code := strings.ReplaceAll(xy, ".", "")
			res.Status[rel] = code
			// Roll status up so collapsed directories still show changes.
			for d := filepath.Dir(rel); d != "." && d != "/"; d = filepath.Dir(d) {
				res.Status[d] = strongerCode(res.Status[d], code)
			}
		}
	}
	return res
}

func parseBranchHeader(rec string, res *GitStatusResult) {
	switch {
	case strings.HasPrefix(rec, "# branch.head "):
		h := strings.TrimPrefix(rec, "# branch.head ")
		if h == "(detached)" {
			res.Detached = true
		} else { // overrides the oid placeholder
			res.Branch = h
		}
	case strings.HasPrefix(rec, "# branch.oid "):
		// Comes before branch.head; used as the label when HEAD is detached.
		if oid := strings.TrimPrefix(rec, "# branch.oid "); len(oid) >= 7 && res.Branch == "" {
			res.Branch = oid[:7]
		}
	case strings.HasPrefix(rec, "# branch.upstream "):
		res.Upstream = strings.TrimPrefix(rec, "# branch.upstream ")
	case strings.HasPrefix(rec, "# branch.ab "):
		for _, f := range strings.Fields(strings.TrimPrefix(rec, "# branch.ab ")) {
			n, _ := strconv.Atoi(f[1:])
			if f[0] == '+' {
				res.Ahead = n
			} else {
				res.Behind = n
			}
		}
	}
}

func changeKind(t byte, xy string) string {
	switch {
	case t == 'u':
		return "conflict"
	case t == '?':
		return "untracked"
	case t == '2':
		return "renamed"
	case strings.Contains(xy, "D"):
		return "deleted"
	case strings.Contains(xy, "A"):
		return "added"
	}
	return "modified"
}

// strongerCode picks which status a directory shows: conflict > modified/deleted > added > untracked.
func strongerCode(cur, next string) string {
	rank := func(c string) int {
		switch {
		case c == "":
			return 0
		case strings.Contains(c, "U"):
			return 4
		case strings.ContainsAny(c, "MD"):
			return 3
		case strings.ContainsAny(c, "AR"):
			return 2
		}
		return 1
	}
	if rank(next) > rank(cur) {
		if strings.ContainsAny(next, "D") && !strings.Contains(next, "U") {
			return "M" // a deleted child means the directory was modified
		}
		return next
	}
	return cur
}

func realPath(p string) string {
	if r, err := filepath.EvalSymlinks(p); err == nil {
		p = r
	}
	if a, err := filepath.Abs(p); err == nil {
		p = a
	}
	return p
}

type BranchResult struct {
	Success bool   `json:"success"`
	Branch  string `json:"branch,omitempty"`
	Error   string `json:"error,omitempty"`
}

func (s *CodeView) GetGitBranch(dir string) BranchResult {
	out, err := git(dir, "branch", "--show-current")
	if err != nil {
		return BranchResult{Error: err.Error()}
	}
	b := strings.TrimSpace(string(out))
	if b == "" { // detached HEAD
		if sha, err := git(dir, "rev-parse", "--short", "HEAD"); err == nil {
			b = strings.TrimSpace(string(sha))
		}
	}
	return BranchResult{Success: true, Branch: b}
}

// ─── Pull requests (GitHub CLI) ──────────────────────────────────────────────

type PRAuthor struct {
	Login string `json:"login"`
}

type PullRequest struct {
	Number         int      `json:"number"`
	Title          string   `json:"title"`
	URL            string   `json:"url"`
	State          string   `json:"state"`
	IsDraft        bool     `json:"isDraft"`
	HeadRefName    string   `json:"headRefName"`
	Author         PRAuthor `json:"author"`
	ReviewDecision string   `json:"reviewDecision"`
	UpdatedAt      string   `json:"updatedAt"`
	Checks         string   `json:"checks"` // passing|failing|pending|"" (only for the current branch's PR)
}

type PRResult struct {
	Success bool          `json:"success"`
	Error   string        `json:"error,omitempty"`
	Reason  string        `json:"reason,omitempty"` // no-gh|no-auth|no-remote|error
	Repo    string        `json:"repo,omitempty"`
	Current *PullRequest  `json:"current"`
	PRs     []PullRequest `json:"prs"`
}

const prFields = "number,title,url,state,isDraft,headRefName,author,reviewDecision,updatedAt"

func (s *CodeView) GetPullRequests(dir string) PRResult {
	<-shellEnvReadyOrTimeout()
	if _, err := exec.LookPath("gh"); err != nil {
		return PRResult{Reason: "no-gh", Error: "Install the GitHub CLI (brew install gh) to see pull requests.", PRs: []PullRequest{}}
	}
	repoOut, err := runIn(dir, 15*time.Second, "gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")
	if err != nil {
		return prError(err)
	}
	res := PRResult{Success: true, Repo: strings.TrimSpace(string(repoOut)), PRs: []PullRequest{}}

	out, err := runIn(dir, 20*time.Second, "gh", "pr", "list", "--state", "open", "--limit", "50", "--json", prFields)
	if err != nil {
		return prError(err)
	}
	if err := json.Unmarshal(out, &res.PRs); err != nil {
		return PRResult{Reason: "error", Error: "Could not parse gh output", PRs: []PullRequest{}}
	}

	// PR for the checked-out branch (may be closed/merged, so not in the list above).
	if cur, err := runIn(dir, 20*time.Second, "gh", "pr", "view", "--json", prFields+",statusCheckRollup"); err == nil {
		var pr struct {
			PullRequest
			Rollup []struct {
				Status     string `json:"status"`
				Conclusion string `json:"conclusion"`
				State      string `json:"state"`
			} `json:"statusCheckRollup"`
		}
		if json.Unmarshal(cur, &pr) == nil && pr.Number > 0 {
			p := pr.PullRequest
			for _, c := range pr.Rollup {
				st := strings.ToUpper(c.Conclusion + c.State)
				switch {
				case strings.Contains(st, "FAIL") || strings.Contains(st, "ERROR") || st == "CANCELLED" || st == "TIMED_OUT":
					p.Checks = "failing"
				case p.Checks != "failing" && (c.Status != "" && c.Status != "COMPLETED" || st == "PENDING" || st == "EXPECTED"):
					p.Checks = "pending"
				case p.Checks == "":
					p.Checks = "passing"
				}
			}
			res.Current = &p
		}
	}
	return res
}

func prError(err error) PRResult {
	msg := err.Error()
	low := strings.ToLower(msg)
	r := PRResult{Reason: "error", Error: msg, PRs: []PullRequest{}}
	switch {
	case strings.Contains(low, "gh auth login") || strings.Contains(low, "not logged"):
		r.Reason, r.Error = "no-auth", "Run `gh auth login` to see pull requests."
	case strings.Contains(low, "no git remotes") || strings.Contains(low, "none of the git remotes") || strings.Contains(low, "not a git repository"):
		r.Reason, r.Error = "no-remote", "No GitHub remote for this repository."
	}
	return r
}

func shellEnvReadyOrTimeout() <-chan struct{} {
	ch := make(chan struct{})
	go func() {
		select {
		case <-shellEnvReady:
		case <-time.After(6 * time.Second):
		}
		close(ch)
	}()
	return ch
}
