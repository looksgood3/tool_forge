import { useEffect, useState } from 'react'
import { FolderOpen, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModeToggle } from '@/components/tool/ModeToggle'
import {
  GetPassword,
  PickDirectory,
  SavePassword,
  DeletePassword,
} from '../../../wailsjs/go/main/App'
import {
  useForensicStore,
  sshPasswordKey,
} from '@/stores/forensic'
import { buildArgs, previewCommand, type FormState, type Platform } from './types'

interface Props {
  form: FormState
  onChange: (next: FormState) => void
  onRun: () => void
  disabled: boolean
}

export function ForensicForm({ form, onChange, onRun, disabled }: Props) {
  const defaultSshAddr = useForensicStore((s) => s.defaultSshAddr)
  const defaultOutputBase = useForensicStore((s) => s.defaultOutputBase)
  const [passwordLoaded, setPasswordLoaded] = useState(false)

  // 进入时把 store 的默认值灌进来
  useEffect(() => {
    if (form.sshAddr === 'root@127.0.0.1:22' && defaultSshAddr) {
      onChange({ ...form, sshAddr: defaultSshAddr })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSshAddr])

  // 尝试从 keychain 加载密码
  useEffect(() => {
    if (form.platform !== 'ios' || passwordLoaded) return
    GetPassword(sshPasswordKey(form.sshAddr)).then((pwd) => {
      setPasswordLoaded(true)
      if (pwd) {
        onChange({ ...form, sshPassword: pwd, rememberPassword: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.platform, form.sshAddr])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onChange({ ...form, [key]: value })
  }

  const pickOutput = async () => {
    const picked = await PickDirectory('选择输出目录', defaultOutputBase || '').catch(
      () => ''
    )
    if (picked) setField('outputDir', picked)
  }

  const run = async () => {
    if (form.platform === 'ios' && form.sshPassword) {
      const key = sshPasswordKey(form.sshAddr)
      if (form.rememberPassword) {
        await SavePassword(key, form.sshPassword).catch(() => {})
      } else {
        await DeletePassword(key).catch(() => {})
      }
    }
    onRun()
  }

  const canRun =
    !disabled &&
    form.keywords.trim().length > 0 &&
    form.outputDir.trim().length > 0 &&
    (form.platform === 'android' || form.sshAddr.trim().length > 0)

  const args = buildArgs(form)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">任务参数</span>
        <ModeToggle
          value={form.platform}
          onChange={(p) => setField('platform', p as Platform)}
          options={[
            { value: 'android', label: 'Android' },
            { value: 'ios', label: 'iOS' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <Field
          label="关键词"
          hint="应用包名或部分匹配，多个用英文逗号分隔"
          required
        >
          <input
            value={form.keywords}
            onChange={(e) => setField('keywords', e.target.value)}
            placeholder="com.kik.chat 或 tencent,facebook"
            spellCheck={false}
            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </Field>

        <Field label="输出目录" required>
          <div className="flex gap-2">
            <input
              value={form.outputDir}
              onChange={(e) => setField('outputDir', e.target.value)}
              placeholder="D:\exhibits\..."
              spellCheck={false}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <Button variant="outline" size="sm" onClick={pickOutput} type="button">
              <FolderOpen className="h-3.5 w-3.5" />
              浏览
            </Button>
          </div>
        </Field>

        <Field label="指定路径（可选）" hint="设备内绝对路径，多个用逗号分隔">
          <input
            value={form.specifyPaths}
            onChange={(e) => setField('specifyPaths', e.target.value)}
            placeholder="/var/mobile/Library/Passes"
            spellCheck={false}
            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </Field>

        {form.platform === 'ios' && (
          <>
            <Field label="SSH 地址" required>
              <input
                value={form.sshAddr}
                onChange={(e) => setField('sshAddr', e.target.value)}
                placeholder="root@127.0.0.1:22"
                spellCheck={false}
                className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>

            <Field label="SSH 密码">
              <div className="space-y-1.5">
                <input
                  type="password"
                  value={form.sshPassword}
                  onChange={(e) => setField('sshPassword', e.target.value)}
                  placeholder="默认 alpine"
                  spellCheck={false}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.rememberPassword}
                    onChange={(e) => setField('rememberPassword', e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  记住密码（保存到系统凭据库）
                </label>
              </div>
            </Field>

            <Field label="USB 代理">
              <label
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors',
                  form.usbProxy
                    ? 'border-foreground/30 bg-accent font-medium'
                    : 'border-input bg-background hover:bg-accent'
                )}
              >
                <input
                  type="checkbox"
                  checked={form.usbProxy}
                  onChange={(e) => setField('usbProxy', e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                自动通过 USB 建立代理（推荐）
              </label>
            </Field>

            <Field label="设备 ID（可选）">
              <input
                value={form.deviceId}
                onChange={(e) => setField('deviceId', e.target.value)}
                placeholder="默认使用第一台检测到的设备"
                spellCheck={false}
                className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
          </>
        )}
      </div>

      <div className="border-t border-border bg-muted/30 px-4 py-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">命令预览</div>
        <code className="block break-all rounded bg-background px-3 py-2 font-mono text-[12px]">
          {previewCommand(form)}
        </code>
        <div className="mt-3 flex justify-end">
          <Button onClick={run} disabled={!canRun}>
            <Play className="h-3.5 w-3.5" />
            {disabled ? '执行中…' : '开始取证'}
          </Button>
        </div>
      </div>

      {/* args preview hidden helper for debugging; keep var used */}
      <span className="hidden">{args.length}</span>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-baseline gap-2 text-xs font-medium">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && <span className="text-muted-foreground font-normal">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
