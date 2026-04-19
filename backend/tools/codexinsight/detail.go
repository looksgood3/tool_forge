package codexinsight

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// LoadSession 读取单个 jsonl,返回结构化消息。
// 跳过系统事件,只保留 user/assistant message / function_call / function_call_output / reasoning。
// function_call / function_call_output 在末尾用 call_id 配对,合并到同一个 block。
func LoadSession(filePath string) (*SessionDetail, error) {
	if filePath == "" {
		return nil, fmt.Errorf("文件路径不能为空")
	}
	if !strings.HasSuffix(strings.ToLower(filePath), ".jsonl") {
		return nil, fmt.Errorf("仅支持读取 .jsonl 文件")
	}
	cleanPath := filepath.Clean(filePath)

	f, err := os.Open(cleanPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, maxScanTokenSize)

	detail := &SessionDetail{
		FilePath: cleanPath,
		Messages: []Message{},
	}

	// "当前 turn"的 model,随 turn_context 事件更新
	currentModel := ""

	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var ev struct {
			Timestamp string          `json:"timestamp"`
			Type      string          `json:"type"`
			Payload   json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(line, &ev); err != nil {
			continue
		}

		switch ev.Type {
		case "session_meta":
			var p struct {
				ID  string `json:"id"`
				Cwd string `json:"cwd"`
			}
			if err := json.Unmarshal(ev.Payload, &p); err == nil {
				if detail.SessionID == "" {
					detail.SessionID = p.ID
				}
				if detail.Project == "" {
					detail.Project = p.Cwd
				}
			}

		case "turn_context":
			var p struct {
				Cwd   string `json:"cwd"`
				Model string `json:"model"`
			}
			if err := json.Unmarshal(ev.Payload, &p); err == nil {
				if p.Model != "" {
					currentModel = p.Model
				}
				if detail.Project == "" && p.Cwd != "" {
					detail.Project = p.Cwd
				}
			}

		case "response_item":
			msg, ok := parseResponseItem(ev.Payload, ev.Timestamp, currentModel)
			if !ok {
				continue
			}
			// 给消息人造 uuid,用于前端定位
			msg.UUID = fmt.Sprintf("%s-%d", detail.SessionID, len(detail.Messages))
			detail.Messages = append(detail.Messages, msg)
		}
	}

	// 配对 function_call 与 function_call_output
	pairFunctionCalls(detail.Messages)
	// 配对后剔除空消息
	detail.Messages = stripEmpty(detail.Messages)
	// 重新编号 UUID(因为剔除后 index 变了,保持前端 focus 的语义一致)
	for i := range detail.Messages {
		detail.Messages[i].UUID = fmt.Sprintf("%s-%d", detail.SessionID, i)
	}
	return detail, nil
}

// parseResponseItem 从 response_item.payload 里生成一条 Message。
// 返回 ok=false 表示该 item 应当跳过(空白/环境注入/加密 reasoning 无内容等)。
func parseResponseItem(payload json.RawMessage, timestamp, model string) (Message, bool) {
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(payload, &head); err != nil {
		return Message{}, false
	}

	switch head.Type {
	case "message":
		var p struct {
			Role    string          `json:"role"`
			Content json.RawMessage `json:"content"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return Message{}, false
		}
		if p.Role != "user" && p.Role != "assistant" {
			return Message{}, false
		}
		blocks := extractMessageBlocks(p.Role, p.Content)
		if len(blocks) == 0 {
			return Message{}, false
		}
		msg := Message{
			Role:      p.Role,
			Timestamp: timestamp,
			Blocks:    blocks,
		}
		if p.Role == "assistant" {
			msg.Model = model
		}
		return msg, true

	case "function_call":
		var p struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
			CallID    string `json:"call_id"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return Message{}, false
		}
		inputPretty := prettyJSONIfValid(p.Arguments)
		return Message{
			Role:      "assistant",
			Timestamp: timestamp,
			Model:     model,
			Blocks: []Block{
				{
					Type:   "function_call",
					Name:   p.Name,
					Input:  inputPretty,
					CallID: p.CallID,
				},
			},
		}, true

	case "function_call_output":
		var p struct {
			CallID string `json:"call_id"`
			Output string `json:"output"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return Message{}, false
		}
		return Message{
			Role:      "user", // function_call_output 通常标记为 user 角色(反馈给模型)
			Timestamp: timestamp,
			Blocks: []Block{
				{
					Type:   "function_call_output",
					CallID: p.CallID,
					Output: p.Output,
				},
			},
		}, true

	case "reasoning":
		// Codex 的 reasoning.encrypted_content 是加密的,展示出来只是乱码,对阅读无意义。
		// 只有少数场景 summary 里有文字,优先取 summary。
		var p struct {
			Summary []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"summary"`
		}
		if err := json.Unmarshal(payload, &p); err != nil {
			return Message{}, false
		}
		var sb strings.Builder
		for _, s := range p.Summary {
			if s.Type == "summary_text" && strings.TrimSpace(s.Text) != "" {
				if sb.Len() > 0 {
					sb.WriteString("\n\n")
				}
				sb.WriteString(s.Text)
			}
		}
		text := strings.TrimSpace(sb.String())
		if text == "" {
			return Message{}, false
		}
		return Message{
			Role:      "assistant",
			Timestamp: timestamp,
			Model:     model,
			Blocks:    []Block{{Type: "reasoning", Text: text}},
		}, true
	}
	return Message{}, false
}

// extractMessageBlocks 从 message.content 数组里抽 text blocks。
// Codex user 用 input_text,assistant 用 output_text;只保留文本。
func extractMessageBlocks(role string, raw json.RawMessage) []Block {
	if len(raw) == 0 {
		return nil
	}
	var arr []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &arr); err != nil {
		return nil
	}
	var out []Block
	for _, p := range arr {
		txt := strings.TrimSpace(p.Text)
		if txt == "" {
			continue
		}
		if role == "user" && strings.HasPrefix(txt, "<environment_context>") {
			continue // Codex 自动注入的环境信息,不展示
		}
		switch p.Type {
		case "input_text", "output_text":
			out = append(out, Block{Type: "text", Text: p.Text})
		}
	}
	return out
}

func prettyJSONIfValid(s string) string {
	if strings.TrimSpace(s) == "" {
		return ""
	}
	var tmp interface{}
	if err := json.Unmarshal([]byte(s), &tmp); err != nil {
		return s
	}
	out, err := json.MarshalIndent(tmp, "", "  ")
	if err != nil {
		return s
	}
	return string(out)
}

// pairFunctionCalls 把 function_call_output 的输出合并到对应 function_call block,
// 并把 function_call_output 的 block 清空(后续剔除)。
func pairFunctionCalls(messages []Message) {
	type loc struct{ msg, block int }
	byID := make(map[string]loc)
	for i := range messages {
		for j := range messages[i].Blocks {
			b := &messages[i].Blocks[j]
			if b.Type == "function_call" && b.CallID != "" {
				byID[b.CallID] = loc{i, j}
			}
		}
	}
	for i := range messages {
		for j := range messages[i].Blocks {
			b := &messages[i].Blocks[j]
			if b.Type != "function_call_output" || b.CallID == "" {
				continue
			}
			if lc, ok := byID[b.CallID]; ok {
				messages[lc.msg].Blocks[lc.block].Output = b.Output
				// 将当前 block 标记为空,待 strip
				messages[i].Blocks[j] = Block{}
			}
		}
	}
}

// stripEmpty 剔除 block 全空的 message,以及剩下都是空 block 的 message
func stripEmpty(messages []Message) []Message {
	out := make([]Message, 0, len(messages))
	for _, m := range messages {
		kept := make([]Block, 0, len(m.Blocks))
		for _, b := range m.Blocks {
			if b.Type == "" {
				continue
			}
			kept = append(kept, b)
		}
		if len(kept) == 0 {
			continue
		}
		m.Blocks = kept
		out = append(out, m)
	}
	return out
}
