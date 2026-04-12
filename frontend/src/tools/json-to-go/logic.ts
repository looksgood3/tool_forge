export interface ConvertOptions {
  rootName: string
  useOmitempty: boolean
  usePointers: boolean
}

interface StructDef {
  name: string
  fields: FieldDef[]
}

interface FieldDef {
  name: string
  type: string
  tag: string
}

export function jsonToGo(json: string, opts: ConvertOptions): string {
  const data = JSON.parse(json)
  const structs: StructDef[] = []
  const usedNames = new Set<string>()
  const rootType = resolveType(data, opts.rootName, structs, usedNames, opts)
  if (structs.length === 0) {
    return `// 根类型: ${rootType}\ntype ${opts.rootName} ${rootType}\n`
  }
  return structs
    .map((s) => renderStruct(s))
    .reverse()
    .join('\n\n')
}

function resolveType(
  value: unknown,
  suggestedName: string,
  structs: StructDef[],
  usedNames: Set<string>,
  opts: ConvertOptions
): string {
  if (value === null) return 'interface{}'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]interface{}'
    const inner = mergeArrayType(value, suggestedName, structs, usedNames, opts)
    return `[]${inner}`
  }
  const t = typeof value
  if (t === 'string') return 'string'
  if (t === 'boolean') return 'bool'
  if (t === 'number') return Number.isInteger(value) ? 'int64' : 'float64'
  if (t === 'object') {
    const name = uniqueName(pascal(suggestedName), usedNames)
    usedNames.add(name)
    const fields: FieldDef[] = []
    const obj = value as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      const fieldType = resolveType(obj[key], singularize(key), structs, usedNames, opts)
      const finalType =
        opts.usePointers && isStructType(fieldType) ? '*' + fieldType : fieldType
      fields.push({
        name: pascal(key),
        type: finalType,
        tag: buildTag(key, opts.useOmitempty),
      })
    }
    structs.push({ name, fields })
    return name
  }
  return 'interface{}'
}

function mergeArrayType(
  arr: unknown[],
  suggestedName: string,
  structs: StructDef[],
  usedNames: Set<string>,
  opts: ConvertOptions
): string {
  const first = arr[0]
  if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
    const merged = mergeObjects(arr as Record<string, unknown>[])
    return resolveType(merged, singularize(suggestedName), structs, usedNames, opts)
  }
  return resolveType(first, suggestedName, structs, usedNames, opts)
}

function mergeObjects(
  arr: Record<string, unknown>[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const obj of arr) {
    for (const k of Object.keys(obj)) {
      if (!(k in merged) || merged[k] === null) merged[k] = obj[k]
    }
  }
  return merged
}

function isStructType(t: string): boolean {
  return /^[A-Z]/.test(t) && !t.startsWith('[]')
}

function pascal(s: string): string {
  const parts = s.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (parts.length === 0) return 'Field'
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
    .replace(/^(\d)/, 'F$1')
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let i = 2
  while (used.has(base + i)) i++
  return base + i
}

function singularize(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y'
  if (s.endsWith('ses')) return s.slice(0, -2)
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1)
  return s
}

function buildTag(key: string, omitempty: boolean): string {
  const parts = [key]
  if (omitempty) parts.push('omitempty')
  return `\`json:"${parts.join(',')}"\``
}

function renderStruct(s: StructDef): string {
  const maxNameLen = Math.max(...s.fields.map((f) => f.name.length))
  const maxTypeLen = Math.max(...s.fields.map((f) => f.type.length))
  const lines = s.fields.map((f) => {
    const name = f.name.padEnd(maxNameLen)
    const type = f.type.padEnd(maxTypeLen)
    return `\t${name} ${type} ${f.tag}`
  })
  return `type ${s.name} struct {\n${lines.join('\n')}\n}`
}
