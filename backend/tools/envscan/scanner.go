package envscan

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// perItemTimeout 单条命令的执行超时。java/docker 冷启动最慢也应该在 2s 内回来。
const perItemTimeout = 2 * time.Second

// fallbackVersionPattern 未指定 VersionRegex 时的兜底：第一个形如 1.2 / 1.2.3 / 1.2.3-rc1 的子串。
var fallbackVersionPattern = regexp.MustCompile(`(\d+\.\d+(?:\.\d+)?(?:[-.+][\w.]+)?)`)

// Scan 并发扫描 catalog,返回仅包含 installed / error 的结果。
// 未安装(PATH 中找不到命令)的条目会被直接丢弃。
func Scan(ctx context.Context) ScanReport {
	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		results = make([]Result, 0, len(catalog))
	)

	for _, item := range catalog {
		wg.Add(1)
		go func(it Item) {
			defer wg.Done()
			res, ok := scanOne(ctx, it)
			if !ok {
				return
			}
			mu.Lock()
			results = append(results, res)
			mu.Unlock()
		}(item)
	}
	wg.Wait()

	// 按 category + name 稳定排序,前端直接按数组顺序渲染
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Category != results[j].Category {
			return categoryOrder(results[i].Category) < categoryOrder(results[j].Category)
		}
		return strings.ToLower(results[i].Name) < strings.ToLower(results[j].Name)
	})

	return ScanReport{
		Results:   results,
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
	}
}

// scanOne 返回 (result, 是否应上报)。找不到命令则返回 false 丢弃。
func scanOne(parent context.Context, item Item) (Result, bool) {
	path, err := exec.LookPath(item.Command)
	if err != nil {
		return Result{}, false
	}

	ctx, cancel := context.WithTimeout(parent, perItemTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, item.Command, item.Args...)
	applyPlatformCmd(cmd)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	combined := stdout.String() + stderr.String()

	base := Result{
		Name:     item.Name,
		Command:  item.Command,
		Path:     path,
		Category: item.Category,
	}

	if runErr != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			base.Status = StatusError
			base.Error = "执行超时"
			return base, true
		}
		// 某些工具（如部分 mysql 客户端）即便退出码非 0 也打印了版本;能解析出来就当成功
		if v := extractVersion(item.VersionRegex, combined); v != "" {
			base.Status = StatusInstalled
			base.Version = v
			return base, true
		}
		// 执行失败且没有任何输出——典型如 Windows Store 的 python3.exe 存根(exit 9009)、
		// 或 PATH 里残留的幽灵 shim。上报这类条目只是噪音,直接丢弃当作未安装处理。
		if strings.TrimSpace(combined) == "" {
			return Result{}, false
		}
		base.Status = StatusError
		base.Error = truncate(strings.TrimSpace(combined), 200)
		return base, true
	}

	v := extractVersion(item.VersionRegex, combined)
	if v == "" {
		base.Status = StatusError
		snippet := truncate(strings.TrimSpace(combined), 80)
		if snippet == "" {
			base.Error = "命令未输出任何内容"
		} else {
			base.Error = "无法解析版本号。原始输出: " + snippet
		}
		return base, true
	}
	base.Status = StatusInstalled
	base.Version = v
	return base, true
}

// extractVersion 用 item 指定的正则抽第一个 capture group;没指定则用 fallback。
func extractVersion(pattern, text string) string {
	if pattern != "" {
		re, err := regexp.Compile(pattern)
		if err != nil {
			return ""
		}
		m := re.FindStringSubmatch(text)
		if len(m) >= 2 {
			return strings.TrimSpace(m[1])
		}
		return ""
	}
	m := fallbackVersionPattern.FindStringSubmatch(text)
	if len(m) >= 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func categoryOrder(c Category) int {
	switch c {
	case CategoryLanguage:
		return 0
	case CategoryPackage:
		return 1
	case CategoryAI:
		return 2
	case CategoryToolchain:
		return 3
	case CategoryDatabase:
		return 4
	default:
		return 99
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
