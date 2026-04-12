import { diffLines, type Change } from 'diff'

export type LineKind = 'same' | 'add' | 'remove'

export interface DiffRow {
  leftNo: number | null
  leftText: string
  rightNo: number | null
  rightText: string
  kind: LineKind
}

export function computeRows(
  left: string,
  right: string,
  ignoreWhitespace: boolean
): DiffRow[] {
  const changes: Change[] = diffLines(left, right, {
    ignoreWhitespace,
    newlineIsToken: false,
  })

  const rows: DiffRow[] = []
  let leftNo = 1
  let rightNo = 1
  let pendingRemoves: { no: number; text: string }[] = []

  const flushPending = () => {
    for (const r of pendingRemoves) {
      rows.push({
        leftNo: r.no,
        leftText: r.text,
        rightNo: null,
        rightText: '',
        kind: 'remove',
      })
    }
    pendingRemoves = []
  }

  for (const part of changes) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    if (part.added) {
      for (const text of lines) {
        const pair = pendingRemoves.shift()
        if (pair) {
          rows.push({
            leftNo: pair.no,
            leftText: pair.text,
            rightNo: rightNo++,
            rightText: text,
            kind: 'remove',
          })
        } else {
          rows.push({
            leftNo: null,
            leftText: '',
            rightNo: rightNo++,
            rightText: text,
            kind: 'add',
          })
        }
      }
    } else if (part.removed) {
      for (const text of lines) {
        pendingRemoves.push({ no: leftNo++, text })
      }
    } else {
      flushPending()
      for (const text of lines) {
        rows.push({
          leftNo: leftNo++,
          leftText: text,
          rightNo: rightNo++,
          rightText: text,
          kind: 'same',
        })
      }
    }
  }
  flushPending()
  return rows
}

export function summarize(rows: DiffRow[]) {
  let adds = 0
  let removes = 0
  let changes = 0
  for (const r of rows) {
    if (r.kind === 'add') adds++
    else if (r.kind === 'remove') {
      if (r.rightNo !== null) changes++
      else removes++
    }
  }
  return { adds, removes, changes }
}
