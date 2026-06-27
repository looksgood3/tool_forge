package llmproxy

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// configPath ~/.toolforge/llm-proxy.json
func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".toolforge", "llm-proxy.json"), nil
}

// dbFilePath ~/.toolforge/llm-proxy/logs.db(目录不存在则创建)
func dbFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".toolforge", "llm-proxy")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "logs.db"), nil
}

// LoadConfig 读配置;不存在返回默认。
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
	return cfg, nil
}

// SaveConfig 写配置(目录自动创建)。
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
	return os.WriteFile(path, data, 0o644)
}
