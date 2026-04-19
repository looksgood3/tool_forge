package codexinsight

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// HistoryItem ~/.codex/history.jsonl 的一行(用户某次输入的 prompt 快照)
type HistoryItem struct {
	SessionID string `json:"session_id"`
	Timestamp int64  `json:"timestamp"` // unix 秒
	Text      string `json:"text"`
}

// HistoryResult 返回
type HistoryResult struct {
	Items     []HistoryItem `json:"items"`
	Total     int           `json:"total"`      // 过滤前的总数
	Filtered  int           `json:"filtered"`   // 过滤后的数量
	FilePath  string        `json:"file_path"`
	ScannedAt string        `json:"scanned_at"`
}

// ListHistory 读取 ~/.codex/history.jsonl 并按 ts 倒序返回。
// query 非空时做大小写无关子串过滤(匹配 text)。
func ListHistory(codexDir, query string) (*HistoryResult, error) {
	dir, err := resolveCodexDir(codexDir)
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "history.jsonl")
	out := &HistoryResult{
		FilePath:  path,
		Items:     []HistoryItem{},
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
	}
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return out, nil
		}
		return nil, err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 4*1024*1024)

	qLower := strings.ToLower(strings.TrimSpace(query))

	var all []HistoryItem
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var raw struct {
			SessionID string `json:"session_id"`
			Ts        int64  `json:"ts"`
			Text      string `json:"text"`
		}
		if err := json.Unmarshal(line, &raw); err != nil {
			continue
		}
		all = append(all, HistoryItem{
			SessionID: raw.SessionID,
			Timestamp: raw.Ts,
			Text:      raw.Text,
		})
	}

	out.Total = len(all)
	if qLower != "" {
		filtered := make([]HistoryItem, 0, len(all))
		for _, it := range all {
			if strings.Contains(strings.ToLower(it.Text), qLower) ||
				strings.Contains(strings.ToLower(it.SessionID), qLower) {
				filtered = append(filtered, it)
			}
		}
		out.Items = filtered
	} else {
		out.Items = all
	}
	out.Filtered = len(out.Items)

	sort.Slice(out.Items, func(i, j int) bool {
		return out.Items[i].Timestamp > out.Items[j].Timestamp
	})
	return out, nil
}
