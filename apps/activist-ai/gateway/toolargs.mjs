// A tool call whose arguments miss what the tool itself says it needs (OLA-411, OLA-325).
// The checker, Nov 23, iPhone, "make a page for the block party, but ask me two things first":
// 3 s in, a red step "Asked you — Ola asked for this the wrong way and can try again" before any
// card. opencode's question tool needs question, header and options (each a label and a
// description); a call without one is refused by opencode as "Invalid arguments for tool", and the
// person sees the failure even though Ola tries again. The gateway already retries a call that is
// not JSON or names a tool that was not offered; this adds: arguments that miss a required field of
// the tool's own schema, or carry the wrong kind of value for one, are retried too. If every try
// misses, the last reply goes through as before (opencode refuses it and Ola tries again): a
// schema this reads wrongly costs a retry, never a turn.
//
// Only the plain parts of JSON Schema are read (type, required, properties, items); anything else
// (anyOf, $ref, …) is taken as fine. Only shape is judged, never content, and nothing is logged.

const KIND = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
}

function fits(v, schema, depth) {
  if (!schema || typeof schema !== 'object' || depth > 8) return true
  const t = schema.type
  if (typeof t === 'string' && KIND[t] && !KIND[t](v)) return false
  if (KIND.object(v)) {
    if (Array.isArray(schema.required) && schema.required.some((k) => typeof k === 'string' && !(k in v))) return false
    const props = schema.properties
    if (props && typeof props === 'object') for (const [k, s] of Object.entries(props)) if (k in v && v[k] !== null && !fits(v[k], s, depth + 1)) return false
  }
  if (Array.isArray(v) && schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    if (!v.every((x) => fits(x, schema.items, depth + 1))) return false
  }
  return true
}

/** The parameters schema of each tool a request offers, by name. */
export function schemasOf(tools) {
  const m = new Map()
  for (const t of Array.isArray(tools) ? tools : []) {
    const name = t?.function?.name
    if (typeof name === 'string' && t.function.parameters && typeof t.function.parameters === 'object') m.set(name, t.function.parameters)
  }
  return m
}

/** Do these parsed arguments fit the tool's schema? No schema: they fit. */
export const argsFit = (args, schema) => fits(args, schema, 0)
