export type Platform = 'android' | 'ios'

export type RunStatus = 'idle' | 'running' | 'success' | 'canceled' | 'failed'

export interface LogEntry {
  stream: 'stdout' | 'stderr'
  line: string
}

export interface FormState {
  platform: Platform
  keywords: string
  outputDir: string
  specifyPaths: string
  // iOS only
  sshAddr: string
  sshPassword: string
  rememberPassword: boolean
  usbProxy: boolean
  deviceId: string
}

export function defaultFormState(): FormState {
  return {
    platform: 'android',
    keywords: '',
    outputDir: '',
    specifyPaths: '',
    sshAddr: 'root@127.0.0.1:22',
    sshPassword: '',
    rememberPassword: false,
    usbProxy: true,
    deviceId: '',
  }
}

export function buildArgs(form: FormState): string[] {
  const args: string[] = [form.platform, 'export']
  if (form.keywords.trim()) {
    args.push('-k', form.keywords.trim())
  }
  if (form.outputDir.trim()) {
    args.push('-o', form.outputDir.trim())
  }
  if (form.specifyPaths.trim()) {
    args.push('-s', form.specifyPaths.trim())
  }
  if (form.platform === 'ios') {
    if (form.sshAddr.trim()) {
      args.push('-a', form.sshAddr.trim())
    }
    if (form.sshPassword) {
      args.push('-p', form.sshPassword)
    }
    if (form.deviceId.trim()) {
      args.push('-d', form.deviceId.trim())
    }
    if (!form.usbProxy) {
      args.push('-u=false')
    }
  }
  return args
}

export function previewCommand(form: FormState): string {
  const args = buildArgs(form)
  const masked = args.map((a, i) => {
    if (args[i - 1] === '-p' && a) return '***'
    if (/\s/.test(a)) return `"${a}"`
    return a
  })
  return 'go-forensic ' + masked.join(' ')
}
