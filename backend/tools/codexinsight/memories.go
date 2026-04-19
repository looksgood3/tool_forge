package codexinsight

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// MemoryFile ~/.codex/memories 下的一个文件/目录节点
type MemoryFile struct {
	Path      string `json:"path"` // 相对 memories 根,/ 风格
	IsDir     bool   `json:"is_dir"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updated_at"`
}

// MemoryFileList 列表返回
type MemoryFileList struct {
	Files      []MemoryFile `json:"files"`
	MemoryDir  string       `json:"memory_dir"`
}

// MemoryFileContent 文件内容
type MemoryFileContent struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updated_at"`
}

// memoryRelPathPattern 防穿越:不接受 ..,不接受绝对路径
var memoryRelPathPattern = regexp.MustCompile(`^[^/\\]+(?:[/\\][^/\\]+)*$`)

func resolveMemoryDir(custom string) (string, error) {
	base, err := resolveCodexDir(custom)
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "memories"), nil
}

func validateMemoryRel(rel string) error {
	if rel == "" {
		return fmt.Errorf("相对路径不能为空")
	}
	if filepath.IsAbs(rel) {
		return fmt.Errorf("不允许绝对路径")
	}
	clean := filepath.Clean(rel)
	if strings.HasPrefix(clean, "..") || strings.Contains(clean, string(filepath.Separator)+"..") {
		return fmt.Errorf("不允许父级引用")
	}
	if !memoryRelPathPattern.MatchString(rel) {
		return fmt.Errorf("相对路径非法: %s", rel)
	}
	return nil
}

func memoryAbsPath(custom, rel string) (string, string, error) {
	if err := validateMemoryRel(rel); err != nil {
		return "", "", err
	}
	root, err := resolveMemoryDir(custom)
	if err != nil {
		return "", "", err
	}
	target := filepath.Join(root, filepath.Clean(rel))
	if err := ensureUnder(root, target); err != nil {
		return "", "", err
	}
	return root, target, nil
}

// ListMemories 递归列出 memories 目录下所有文件和子目录(展平)。
func ListMemories(codexDir string) (*MemoryFileList, error) {
	root, err := resolveMemoryDir(codexDir)
	if err != nil {
		return nil, err
	}
	out := &MemoryFileList{
		MemoryDir: root,
		Files:     []MemoryFile{},
	}
	info, err := os.Stat(root)
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s 不是目录", root)
	}
	err = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if path == root {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		var size int64
		var mod time.Time
		if fi, err := d.Info(); err == nil {
			size = fi.Size()
			mod = fi.ModTime()
		}
		out.Files = append(out.Files, MemoryFile{
			Path:      filepath.ToSlash(rel),
			IsDir:     d.IsDir(),
			Size:      size,
			UpdatedAt: mod.UTC().Format(time.RFC3339),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out.Files, func(i, j int) bool {
		if out.Files[i].IsDir != out.Files[j].IsDir {
			return out.Files[i].IsDir
		}
		return strings.ToLower(out.Files[i].Path) < strings.ToLower(out.Files[j].Path)
	})
	return out, nil
}

// ReadMemory 读单个 memory 文件。
func ReadMemory(codexDir, rel string) (*MemoryFileContent, error) {
	_, target, err := memoryAbsPath(codexDir, rel)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%s 是目录", rel)
	}
	const maxRead = 4 * 1024 * 1024
	if info.Size() > maxRead {
		return nil, fmt.Errorf("文件过大(%d bytes),超过 4 MB 限制", info.Size())
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	return &MemoryFileContent{
		Path:      filepath.ToSlash(rel),
		Content:   string(data),
		Size:      info.Size(),
		UpdatedAt: info.ModTime().UTC().Format(time.RFC3339),
	}, nil
}

// WriteMemory 覆盖/创建 memory 文件。自动创建上级目录。
func WriteMemory(codexDir, rel, content string) error {
	root, target, err := memoryAbsPath(codexDir, rel)
	if err != nil {
		return err
	}
	const maxWrite = 4 * 1024 * 1024
	if len(content) > maxWrite {
		return fmt.Errorf("内容过大(%d bytes),超过 4 MB 限制", len(content))
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	if dir := filepath.Dir(target); dir != root {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return os.WriteFile(target, []byte(content), 0o644)
}

// DeleteMemory 删单个文件或空目录。
func DeleteMemory(codexDir, rel string) error {
	_, target, err := memoryAbsPath(codexDir, rel)
	if err != nil {
		return err
	}
	info, err := os.Stat(target)
	if err != nil {
		return err
	}
	if info.IsDir() {
		entries, err := os.ReadDir(target)
		if err != nil {
			return err
		}
		if len(entries) > 0 {
			return fmt.Errorf("目录非空,无法删除: %s", rel)
		}
	}
	return os.Remove(target)
}
