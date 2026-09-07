import { homedir } from 'node:os'
import path from 'node:path'

const DEFAULT_LAUNCH_TOKEN = ['.config', 'opute', 'harness-opute-dsh.launch-token']

/**
 * Resolve paths supplied through systemd or a shell without treating `~` as a
 * literal directory relative to the repository. `%h` is systemd's home
 * specifier; accepting it here also keeps direct launcher invocations safe.
 */
export function resolveLaunchTokenFile(value, home = homedir()) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return path.join(home, ...DEFAULT_LAUNCH_TOKEN)
  if (raw === '~') return home
  if (raw.startsWith('~/')) return path.join(home, raw.slice(2))
  if (raw === '%h') return home
  if (raw.startsWith('%h/')) return path.join(home, raw.slice(3))
  return raw
}
