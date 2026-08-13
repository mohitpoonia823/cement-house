/**
 * Turns a ZodError into a sentence a shopkeeper can act on.
 *
 * `ZodError.message` is the JSON-serialised issue array — passing it to the
 * client leaks the raw shape straight into the UI:
 *
 *   [ { "code": "too_big", "maximum": 10, "type": "string", ... } ]
 *
 * This produces "Phone must be at most 10 characters" instead. Every 400 in the
 * API routes goes through here so validation failures read consistently.
 */
import type { ZodError, ZodIssue } from 'zod'

/** `creditLimit` → `Credit limit`; array indices become 1-based positions. */
function fieldLabel(path: ZodIssue['path']): string {
  const named = path.filter((segment): segment is string => typeof segment === 'string')
  const last = named[named.length - 1]
  if (!last) return 'Value'

  const words = last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim()

  const label = words.charAt(0).toUpperCase() + words.slice(1)

  // `items.2.quantity` → "Quantity (item 3)" so the row is identifiable.
  let index: number | undefined
  for (const segment of path) if (typeof segment === 'number') index = segment
  return typeof index === 'number' ? `${label} (item ${index + 1})` : label
}

function issueText(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') return 'is required'
      return `must be a ${issue.expected}`

    case 'too_small':
      if (issue.type === 'string') {
        return Number(issue.minimum) <= 1 ? 'is required' : `must be at least ${issue.minimum} characters`
      }
      if (issue.type === 'array') return `must have at least ${issue.minimum} item(s)`
      return issue.inclusive ? `must be at least ${issue.minimum}` : `must be greater than ${issue.minimum}`

    case 'too_big':
      if (issue.type === 'string') return `must be at most ${issue.maximum} characters`
      if (issue.type === 'array') return `must have at most ${issue.maximum} item(s)`
      return issue.inclusive ? `must be at most ${issue.maximum}` : `must be less than ${issue.maximum}`

    case 'invalid_string':
      if (issue.validation === 'email') return 'must be a valid email address'
      if (issue.validation === 'url') return 'must be a valid URL'
      if (issue.validation === 'uuid') return 'is not a valid reference'
      return issue.message

    case 'invalid_enum_value':
      return `must be one of: ${issue.options.join(', ')}`

    default:
      // Custom `.refine()` messages are already human-written — keep them as-is.
      return issue.message
  }
}

export function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 3).map((issue) => {
    const text = issueText(issue)
    // A custom message often reads as a full sentence already; don't prefix it.
    return text === issue.message && issue.code === 'custom' ? text : `${fieldLabel(issue.path)} ${text}`
  })

  const remaining = error.issues.length - issues.length
  const suffix = remaining > 0 ? ` (and ${remaining} more problem${remaining === 1 ? '' : 's'})` : ''
  return `${issues.join('; ')}${suffix}`
}
