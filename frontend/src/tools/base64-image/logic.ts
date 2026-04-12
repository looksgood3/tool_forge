export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export interface ImageStats {
  mime: string
  bytes: number
  width: number
  height: number
}

export function probeDataUrl(dataUrl: string): Promise<ImageStats> {
  return new Promise((resolve, reject) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      reject(new Error('不是合法的 data URL'))
      return
    }
    const mime = match[1]
    const base64 = match[2]
    const bytes = Math.floor((base64.length * 3) / 4)
    const img = new window.Image()
    img.onload = () => resolve({ mime, bytes, width: img.width, height: img.height })
    img.onerror = () => reject(new Error('无法加载图片'))
    img.src = dataUrl
  })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function downloadDataUrl(dataUrl: string, filename = 'image') {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  const ext = match ? match[1].split('/')[1] || 'bin' : 'bin'
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${filename}.${ext}`
  a.click()
}
