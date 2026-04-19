package claudeinsight

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// 顶层配置文件白名单;只允许这些文件名被读写,防路径越权。
var allowedConfigFiles = map[string]bool{
	"settings.json": true,
	"CLAUDE.md":     true,
}

// ConfigFile 配置文件的内容与元信息
type ConfigFile struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Exists    bool   `json:"exists"`
	Content   string `json:"content"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updated_at"`
}

// ReadConfigFile 读取 ~/.claude 下指定配置文件。
func ReadConfigFile(claudeDir, name string) (*ConfigFile, error) {
	if !allowedConfigFiles[name] {
		return nil, fmt.Errorf("不支持的配置文件: %s", name)
	}
	dir, err := resolveClaudeDir(claudeDir)
	if err != nil {
		return nil, err
	}
	target := filepath.Join(dir, name)
	cf := &ConfigFile{Name: name, Path: target}
	info, err := os.Stat(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cf, nil // exists=false
		}
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%s 是目录", name)
	}
	const maxRead = 2 * 1024 * 1024
	if info.Size() > maxRead {
		return nil, fmt.Errorf("文件过大(%d bytes),超过 2 MB", info.Size())
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	cf.Exists = true
	cf.Content = string(data)
	cf.Size = info.Size()
	cf.UpdatedAt = info.ModTime().UTC().Format(time.RFC3339)
	return cf, nil
}

// WriteConfigFile 覆盖/创建 ~/.claude 下配置文件。
func WriteConfigFile(claudeDir, name, content string) error {
	if !allowedConfigFiles[name] {
		return fmt.Errorf("不支持的配置文件: %s", name)
	}
	dir, err := resolveClaudeDir(claudeDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	const maxWrite = 2 * 1024 * 1024
	if len(content) > maxWrite {
		return fmt.Errorf("内容过大,超过 2 MB")
	}
	return os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644)
}
