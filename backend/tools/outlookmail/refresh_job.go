package outlookmail

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// 给前端订阅的事件名
const (
	EventRefreshStart    = "outlook:refresh:start"    // 一轮开始,data: RefreshJobState
	EventRefreshProgress = "outlook:refresh:progress" // 单账号完成,data: RefreshJobState
	EventRefreshDone     = "outlook:refresh:done"     // 全部完成,data: RefreshJobState
)

// RefreshJobState 给前端看的任务实时状态
type RefreshJobState struct {
	JobID    string          `json:"job_id"`
	StartAt  time.Time       `json:"start_at"`
	EndAt    *time.Time      `json:"end_at,omitempty"`
	Total    int             `json:"total"`
	Done     int             `json:"done"`
	Success  int             `json:"success"`
	Failed   int             `json:"failed"`
	Canceled bool            `json:"canceled"`
	Results  []RefreshResult `json:"results"`
}

// RefreshJobManager 跟踪进行中和最近完成的批量刷新任务,带事件推送
type RefreshJobManager struct {
	mu       sync.Mutex
	svc      *Service
	ctx      context.Context        // wails ctx,用于 EventsEmit
	jobs     map[string]*refreshJob // 进行中
	history  []*RefreshJobState     // 完成 / 取消的最近 N 次
	historyN int
}

type refreshJob struct {
	state  *RefreshJobState
	cancel context.CancelFunc
}

// NewRefreshJobManager 创建任务管理器
func NewRefreshJobManager(svc *Service) *RefreshJobManager {
	return &RefreshJobManager{
		svc:      svc,
		jobs:     make(map[string]*refreshJob),
		historyN: 20,
	}
}

// SetContext wails 启动后注入 ctx,用于事件推送
func (m *RefreshJobManager) SetContext(ctx context.Context) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ctx = ctx
}

// Start 启动一个批量刷新任务;ids 为空 = 全部(自动跳过 disabled)
//
// 返回 jobID,前端拿着 jobID 监听事件或调 GetJob 查状态。
func (m *RefreshJobManager) Start(ids []string) string {
	m.mu.Lock()
	parentCtx := m.ctx
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	m.mu.Unlock()

	// 解析目标账号
	if len(ids) == 0 {
		for _, a := range m.svc.store.AllAccounts() {
			if a.Disabled {
				continue
			}
			ids = append(ids, a.ID)
		}
	}

	jobID := uuid.NewString()
	state := &RefreshJobState{
		JobID:   jobID,
		StartAt: time.Now(),
		Total:   len(ids),
		Results: []RefreshResult{},
	}
	ctx, cancel := context.WithCancel(parentCtx)
	job := &refreshJob{state: state, cancel: cancel}

	m.mu.Lock()
	m.jobs[jobID] = job
	m.mu.Unlock()

	m.emit(EventRefreshStart, state)

	go m.run(ctx, jobID, ids)
	return jobID
}

func (m *RefreshJobManager) run(ctx context.Context, jobID string, ids []string) {
	cfg := m.svc.store.GetConfig()
	gap := time.Duration(cfg.AccountRefreshGapMs) * time.Millisecond

	for i, id := range ids {
		select {
		case <-ctx.Done():
			m.finish(jobID, true)
			return
		default:
		}
		res := m.svc.RefreshOne(ctx, id)
		m.mu.Lock()
		job, ok := m.jobs[jobID]
		if !ok {
			m.mu.Unlock()
			return
		}
		st := job.state
		st.Done++
		if res.Success {
			st.Success++
		} else {
			st.Failed++
		}
		st.Results = append(st.Results, res)
		stateCopy := *st
		m.mu.Unlock()
		m.emit(EventRefreshProgress, &stateCopy)

		if i < len(ids)-1 && gap > 0 {
			select {
			case <-ctx.Done():
				m.finish(jobID, true)
				return
			case <-time.After(gap):
			}
		}
	}
	m.finish(jobID, false)
}

func (m *RefreshJobManager) finish(jobID string, canceled bool) {
	m.mu.Lock()
	job, ok := m.jobs[jobID]
	if !ok {
		m.mu.Unlock()
		return
	}
	now := time.Now()
	job.state.EndAt = &now
	job.state.Canceled = canceled
	final := *job.state // copy
	// 移到 history
	delete(m.jobs, jobID)
	m.history = append([]*RefreshJobState{&final}, m.history...)
	if len(m.history) > m.historyN {
		m.history = m.history[:m.historyN]
	}
	m.mu.Unlock()
	m.emit(EventRefreshDone, &final)
}

// Cancel 取消进行中的任务;不存在则 no-op。
func (m *RefreshJobManager) Cancel(jobID string) {
	m.mu.Lock()
	job, ok := m.jobs[jobID]
	m.mu.Unlock()
	if !ok {
		return
	}
	job.cancel()
}

// GetJob 查任务状态;先查进行中,再查 history
func (m *RefreshJobManager) GetJob(jobID string) *RefreshJobState {
	m.mu.Lock()
	defer m.mu.Unlock()
	if job, ok := m.jobs[jobID]; ok {
		st := *job.state
		return &st
	}
	for _, h := range m.history {
		if h.JobID == jobID {
			st := *h
			return &st
		}
	}
	return nil
}

// ListActive 列进行中的任务
func (m *RefreshJobManager) ListActive() []RefreshJobState {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]RefreshJobState, 0, len(m.jobs))
	for _, j := range m.jobs {
		out = append(out, *j.state)
	}
	return out
}

// History 取最近的完成 / 取消任务
func (m *RefreshJobManager) History() []RefreshJobState {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]RefreshJobState, 0, len(m.history))
	for _, h := range m.history {
		out = append(out, *h)
	}
	return out
}

func (m *RefreshJobManager) emit(event string, state *RefreshJobState) {
	m.mu.Lock()
	ctx := m.ctx
	m.mu.Unlock()
	if ctx == nil {
		return
	}
	wailsruntime.EventsEmit(ctx, event, state)
}
