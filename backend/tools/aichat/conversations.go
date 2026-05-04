package aichat

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ListConversations 列出所有会话(按 UpdatedAt 倒序)
func (s *Service) ListConversations() ([]ConversationSummary, error) {
	d, err := dataDir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(filepath.Join(d, "conversations"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	out := make([]ConversationSummary, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		var c Conversation
		if err := readJSON(filepath.Join(d, "conversations", e.Name()), &c); err != nil || c.ID == "" {
			continue
		}
		out = append(out, ConversationSummary{
			ID:           c.ID,
			Title:        c.Title,
			ProviderID:   c.ProviderID,
			ModelID:      c.ModelID,
			UpdatedAt:    c.UpdatedAt,
			MessageCount: len(c.Messages),
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

// GetConversation 取一条会话(含全部消息)
func (s *Service) GetConversation(id string) (*Conversation, error) {
	if id == "" {
		return nil, fmt.Errorf("会话 ID 不能为空")
	}
	return loadConversation(id)
}

// CreateConversation 新建会话;providerID / modelID 给定后续聊天使用的默认模型
func (s *Service) CreateConversation(providerID, modelID, title string) (*Conversation, error) {
	if title == "" {
		title = "新对话"
	}
	now := time.Now().UnixMilli()
	c := &Conversation{
		ID:         uuid.NewString(),
		Title:      title,
		ProviderID: providerID,
		ModelID:    modelID,
		Messages:   []Message{},
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := saveConversation(c); err != nil {
		return nil, err
	}
	return c, nil
}

// UpdateConversationModel 切换会话使用的供应商 / 模型
func (s *Service) UpdateConversationModel(id, providerID, modelID string) error {
	c, err := loadConversation(id)
	if err != nil {
		return err
	}
	c.ProviderID = providerID
	c.ModelID = modelID
	c.UpdatedAt = time.Now().UnixMilli()
	return saveConversation(c)
}

// RenameConversation 重命名
func (s *Service) RenameConversation(id, title string) error {
	c, err := loadConversation(id)
	if err != nil {
		return err
	}
	t := strings.TrimSpace(title)
	if t == "" {
		t = "无标题"
	}
	c.Title = t
	c.UpdatedAt = time.Now().UnixMilli()
	return saveConversation(c)
}

// DeleteConversationByID 删除一条会话(磁盘 + 进行中的流)
func (s *Service) DeleteConversationByID(id string) error {
	// 取消可能正在进行的流
	s.cancelStream(id)
	return deleteConversation(id)
}

// autoTitle 从 user 首条消息生成标题(最多 30 字)
func autoTitle(content string) string {
	t := strings.TrimSpace(content)
	t = strings.ReplaceAll(t, "\n", " ")
	if t == "" {
		return "新对话"
	}
	r := []rune(t)
	if len(r) > 30 {
		return string(r[:30]) + "…"
	}
	return string(r)
}
