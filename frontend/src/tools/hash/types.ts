// 与后端 backend/tools/filehash 对齐

export interface FileInfo {
  path: string
  name: string
  ext: string
  size: number
  modifiedAt: number // unix milli
  mimeType: string
  mimeExt: string
  category: string
  magicHex: string
  isDir: boolean
}

export interface Progress {
  jobId: string
  index: number
  total: number
  path: string
  name: string
  bytesDone: number
  bytesTotal: number
  speedBps: number
  elapsedMs: number
}

export interface FileResult {
  jobId: string
  index: number
  total: number
  path: string
  name: string
  size: number
  hashes: Record<string, string>
  durationMs: number
  error?: string
}

// Wails 事件名前缀(按 jobID 拼后缀订阅)
export const EV_PROGRESS = 'filehash:progress:'
export const EV_FILE_DONE = 'filehash:file-done:'
export const EV_DONE = 'filehash:done:'
export const EV_ERROR = 'filehash:error:'
