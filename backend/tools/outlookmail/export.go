package outlookmail

import (
	"fmt"
	"sort"
	"strings"
)

// ExportSummary 导出预览(供前端弹窗按分组显示账号数)
type ExportSummary struct {
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
	Count     int    `json:"count"`
}

// ExportPreview 列出每个分组及其账号数(给"导出邮箱"弹窗用)
func (s *Service) ExportPreview() []ExportSummary {
	groups := s.store.ListGroups()
	all := s.store.AllAccounts()
	countByGroup := make(map[string]int, len(groups))
	for _, a := range all {
		if a.Disabled {
			// disabled 账号也允许导出
		}
		countByGroup[a.GroupID]++
	}
	out := make([]ExportSummary, 0, len(groups))
	for _, g := range groups {
		out = append(out, ExportSummary{
			GroupID:   g.ID,
			GroupName: g.Name,
			Count:     countByGroup[g.ID],
		})
	}
	return out
}

// ExportResult 导出文本(前端拿到后写到用户选定的文件)
type ExportResult struct {
	Content        string   `json:"content"`
	TotalCount     int      `json:"total_count"`
	ExportedGroups []string `json:"exported_groups"` // 实际有数据的分组名(供文件名)
}

// ExportAccounts 按分组组装导出文本。
//
// 输出格式(与 outlookEmail 兼容):
//
//	分组A
//	email----password----client_id----refresh_token
//	email----password----client_id----refresh_token
//	分组B
//	email----password----client_id----refresh_token
//
// groupIDs 为空 → 全部分组。
func (s *Service) ExportAccounts(groupIDs []string) (*ExportResult, error) {
	groups := s.store.ListGroups()
	groupByID := make(map[string]*Group, len(groups))
	for i := range groups {
		groupByID[groups[i].ID] = &groups[i]
	}
	all := s.store.AllAccounts()
	byGroup := make(map[string][]*Account)
	for i := range all {
		a := &all[i]
		byGroup[a.GroupID] = append(byGroup[a.GroupID], a)
	}
	// 决定要导出哪些分组(按 store 已有的 group 顺序)
	var targetIDs []string
	if len(groupIDs) == 0 {
		for _, g := range groups {
			targetIDs = append(targetIDs, g.ID)
		}
	} else {
		set := make(map[string]bool, len(groupIDs))
		for _, id := range groupIDs {
			set[id] = true
		}
		for _, g := range groups {
			if set[g.ID] {
				targetIDs = append(targetIDs, g.ID)
			}
		}
	}

	var lines []string
	var exportedNames []string
	total := 0
	for _, gid := range targetIDs {
		accs := byGroup[gid]
		if len(accs) == 0 {
			continue
		}
		// 同一分组里按 order 升序、CreatedAt 降序
		sort.SliceStable(accs, func(i, j int) bool {
			if accs[i].Order != accs[j].Order {
				return accs[i].Order < accs[j].Order
			}
			return accs[i].CreatedAt.After(accs[j].CreatedAt)
		})
		g := groupByID[gid]
		gname := gid
		if g != nil {
			gname = g.Name
		}
		lines = append(lines, gname)
		exportedNames = append(exportedNames, gname)
		for _, a := range accs {
			rt, err := s.store.DecryptRT(a.ID)
			if err != nil {
				return nil, fmt.Errorf("解密 %s 的 refresh_token 失败: %w", a.Email, err)
			}
			lines = append(lines, fmt.Sprintf("%s----%s----%s----%s",
				a.Email, a.Password, a.ClientID, rt))
			total++
		}
	}
	return &ExportResult{
		Content:        strings.Join(lines, "\n"),
		TotalCount:     total,
		ExportedGroups: exportedNames,
	}, nil
}
