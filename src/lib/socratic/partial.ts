// Read the `reply` string out of a JSON object that is still being written.
//
// The tutor's structured output puts `reply` first, so while the model is
// streaming `{"reply": "Let's start with ...` we can show the student the
// text as it arrives. Decodes JSON string escapes as far as the buffer
// goes and holds back an escape that is cut off mid-way.

const SIMPLE: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }

export function partialReply(json: string): string {
  const key = json.indexOf('"reply"')
  if (key < 0) return ''
  const open = json.indexOf('"', key + 7)
  if (open < 0) return ''
  let i = open + 1
  let out = ''
  while (i < json.length) {
    const c = json[i]
    if (c === '"') break
    if (c === '\\') {
      const n = json[i + 1]
      if (n === undefined) break
      if (n === 'u') {
        const hex = json.slice(i + 2, i + 6)
        if (hex.length < 4) break
        out += String.fromCharCode(parseInt(hex, 16))
        i += 6
        continue
      }
      out += SIMPLE[n] ?? n
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}
