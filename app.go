package main

import (
	"context"
	"runtime"

	"tool_forge/backend/system"
	"tool_forge/backend/tools/charles"
	"tool_forge/backend/tools/forensic"
)

// AppVersion 应用版本号，随 wails.json 同步维护
const AppVersion = "0.1.0"

// AppInfo 应用元信息
type AppInfo struct {
	Version   string `json:"version"`
	GoVersion string `json:"goVersion"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	WailsVer  string `json:"wailsVersion"`
}

// App struct
type App struct {
	ctx      context.Context
	forensic *forensic.Service
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		forensic: forensic.New(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.forensic.SetContext(ctx)
}

// GetAppInfo 返回应用与运行环境信息
func (a *App) GetAppInfo() AppInfo {
	return AppInfo{
		Version:   AppVersion,
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		WailsVer:  "v2.11.0",
	}
}

// ================ Charles ================

// GenerateCharlesKey 根据名称生成 Charles 激活码
func (a *App) GenerateCharlesKey(name string) string {
	return charles.Generate(name)
}

// ================ Forensic ================

// CheckForensic 探测 go-forensic 可执行文件（自定义路径可为空，为空则走 PATH）
func (a *App) CheckForensic(customPath string) forensic.Info {
	return a.forensic.Check(customPath)
}

// SetForensicBinaryPath 配置 go-forensic 路径
func (a *App) SetForensicBinaryPath(path string) {
	a.forensic.SetBinaryPath(path)
}

// RunForensic 启动取证命令，返回 jobID；后续通过 forensic:log / forensic:done 事件推送
func (a *App) RunForensic(args []string) (string, error) {
	return a.forensic.Run(args)
}

// CancelForensic 取消正在执行的任务
func (a *App) CancelForensic(jobID string) error {
	return a.forensic.Cancel(jobID)
}

// ================ System ================

// PickExecutable 选择一个可执行文件
func (a *App) PickExecutable(title string) (string, error) {
	return system.PickFile(a.ctx, system.PickFileOptions{
		Title:       title,
		Extensions:  []string{".exe"},
		DisplayName: "可执行文件",
	})
}

// PickDirectory 选择一个目录
func (a *App) PickDirectory(title, defaultPath string) (string, error) {
	return system.PickDirectory(a.ctx, title, defaultPath)
}

// OpenInExplorer 在系统文件管理器中打开路径
func (a *App) OpenInExplorer(path string) error {
	return system.OpenInExplorer(path)
}

// SavePassword 将密码写入系统凭据库
func (a *App) SavePassword(key, value string) error {
	return system.SavePassword(key, value)
}

// GetPassword 从系统凭据库读取密码
func (a *App) GetPassword(key string) (string, error) {
	return system.GetPassword(key)
}

// DeletePassword 从系统凭据库删除密码
func (a *App) DeletePassword(key string) error {
	return system.DeletePassword(key)
}
