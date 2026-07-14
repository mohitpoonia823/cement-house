// Formats the auto-generated Feature Map (see scripts/generate-feature-map.mjs)
// into grounding text for the support assistant. This is the "assistant
// understands the app" layer — derived from the app's real navigation, labels,
// and action components, so feature/how-to/location questions are answerable
// without any manual authoring, and new features appear the moment they ship.
import featureMap from './feature-map.generated.json'

interface FeatureMapFeature {
  name: string
  route: string
  group: string | null
  description: string | null
  requires: string | null
  actions: string[]
}

const FEATURES: FeatureMapFeature[] = (featureMap as { features: FeatureMapFeature[] }).features ?? []

export function buildFeatureMapContext(user?: { role?: string | null; enabledModules?: string[] | null }): string {
  if (FEATURES.length === 0) return ''
  const lines: string[] = [
    'APP FEATURE MAP (auto-generated from the app itself — use this to answer where a feature is and how to use it):',
  ]
  for (const f of FEATURES) {
    let line = `- ${f.name} (page: ${f.route})`
    if (f.group) line += ` — section: ${f.group}`
    if (f.description) line += `. ${f.description}`
    if (f.actions.length > 0) line += ` Actions available here: ${f.actions.join('; ')}.`
    if (f.requires) line += ` Availability: ${f.requires} — if the user does not see it, it may not be enabled for their plan/role.`
    lines.push(line)
  }
  if (user?.role) {
    lines.push('')
    lines.push(
      user.role === 'OWNER'
        ? 'The current user is the business OWNER and can access owner-only features and Settings.'
        : 'The current user is a STAFF member (not the owner), so owner-only features and subscription settings are not available to them.',
    )
  }
  return lines.join('\n')
}
