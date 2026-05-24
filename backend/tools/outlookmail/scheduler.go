package outlookmail

import (
	"context"
	"sync"
	"time"
)

// scheduler 按配置定时跑全量刷新。
//
// MVP 只支持 interval 模式(每 N 秒跑一圈),Cron 占位但不实现 —— 等用户真的需要再加 croniter 等价物。
type scheduler struct {
	svc *Service

	mu      sync.Mutex
	cancel  context.CancelFunc
	running bool
}

func newScheduler(svc *Service) *scheduler {
	return &scheduler{svc: svc}
}

// Start 由 app.startup 触发;根据当前 config 决定要不要拉起 goroutine。
func (s *scheduler) Start(parent context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return
	}
	cfg := s.svc.store.GetConfig()
	if !cfg.ScheduleEnabled {
		return
	}
	ctx, cancel := context.WithCancel(parent)
	s.cancel = cancel
	s.running = true
	go s.loop(ctx)
}

// Stop 关掉 goroutine
func (s *scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.running = false
}

// Reload 配置变更后调用;先 stop 再按新配置 start
func (s *scheduler) Reload() {
	s.mu.Lock()
	wasRunning := s.running
	cancel := s.cancel
	s.cancel = nil
	s.running = false
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if wasRunning || s.svc.store.GetConfig().ScheduleEnabled {
		// 重新 start;parent ctx 用 background(因为原来的 parent ctx 可能已被关)
		s.Start(context.Background())
	}
}

func (s *scheduler) loop(ctx context.Context) {
	// 启动 5 秒后跑第一轮(避免与 app 启动竞争)
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		cfg := s.svc.store.GetConfig()
		if !cfg.ScheduleEnabled {
			return
		}
		_ = s.svc.RefreshMany(ctx, nil)
		interval := time.Duration(cfg.ScheduleIntervalSec) * time.Second
		if interval < time.Minute {
			interval = time.Hour
		}
		timer.Reset(interval)
	}
}
