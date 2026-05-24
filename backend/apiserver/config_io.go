package apiserver

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// configPath 返回 ~/.toolforge/api-server.json
func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".toolforge", "api-server.json"), nil
}

// LoadConfig 从用户配置目录读取;不存在时返回 DefaultConfig + nil。
// 字段缺失会保留 DefaultConfig 的零值。
func LoadConfig() (Config, error) {
	path, err := configPath()
	if err != nil {
		return DefaultConfig(), err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DefaultConfig(), nil
		}
		return DefaultConfig(), err
	}
	cfg := DefaultConfig()
	if err := json.Unmarshal(data, &cfg); err != nil {
		return DefaultConfig(), err
	}
	if cfg.EnabledTools == nil {
		cfg.EnabledTools = map[string]bool{}
	}
	return cfg, nil
}

// SaveConfig 写到 ~/.toolforge/api-server.json,目录不存在自动创建。
func SaveConfig(cfg Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	// 0o600:token 是敏感凭据,只让属主可读
	return os.WriteFile(path, data, 0o600)
}
