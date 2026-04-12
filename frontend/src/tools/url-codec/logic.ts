export function encodeUrl(text: string): string {
  return encodeURIComponent(text)
}

export function decodeUrl(text: string): string {
  return decodeURIComponent(text.replace(/\+/g, '%20'))
}
