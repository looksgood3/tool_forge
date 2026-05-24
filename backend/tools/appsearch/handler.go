package appsearch

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"tool_forge/backend/system"
)

// Handler 把 appsearch.Service 封装成 apiserver.ToolHandler。
// PHPSESSID 从 keyring 读取后注入,前端 / 外部 API 客户端都不需要传。
type Handler struct {
	svc *Service
}

// NewHandler 由 app.go 在启动时构造,共享同一个 Service 实例。
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Name() string  { return "app-search" }
func (h *Handler) Title() string { return "包名搜索" }
func (h *Handler) Description() string {
	return "多源搜索 iOS / Android 应用包名(iTunes / 七麦 / 应用宝 / Google Play)"
}
func (h *Handler) Methods() []string { return []string{http.MethodPost} }

func (h *Handler) Handle(ctx context.Context, body []byte) ([]byte, error) {
	if h.svc == nil {
		return nil, errors.New("appsearch service not initialized")
	}
	var req SearchRequest
	if len(body) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, errors.New("invalid JSON body: " + err.Error())
		}
	}
	// 七麦 Android 源需要 PHPSESSID,从 keyring 注入
	if needsQimaiPhpSessIDLocal(req.Sources) {
		if sid, err := system.GetPassword(KeyringQimaiPhpSessID); err == nil && sid != "" {
			req.SetQimaiPhpSessID(sid)
		}
	}
	resp, err := h.svc.Search(ctx, req)
	if err != nil {
		return nil, err
	}
	return json.Marshal(resp)
}

// 复制 app.go 的同名小函数,避免 backend 内部循环 import。
func needsQimaiPhpSessIDLocal(sources []SourceID) bool {
	for _, s := range sources {
		if s == SourceQimaiAndroid {
			return true
		}
	}
	return false
}
