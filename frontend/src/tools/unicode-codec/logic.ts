export function textToUnicode(text: string): string {
  let result = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code < 128) {
      result += ch
    } else if (code <= 0xffff) {
      result += '\\u' + code.toString(16).padStart(4, '0')
    } else {
      // surrogate pair
      const high = 0xd800 + ((code - 0x10000) >> 10)
      const low = 0xdc00 + ((code - 0x10000) & 0x3ff)
      result +=
        '\\u' + high.toString(16).padStart(4, '0') +
        '\\u' + low.toString(16).padStart(4, '0')
    }
  }
  return result
}

export function unicodeToText(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}
