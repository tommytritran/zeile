import { fileCategory } from './review-focus';

export interface ArchitectureRole { lane: 'backend' | 'frontend' | 'other'; column: number; label: string }
/** Organizational hints only. These rules never create relationship edges. */
export function architectureRole(path: string): ArchitectureRole {
  const value = path.replaceAll('\\', '/').toLowerCase();
  if (fileCategory(value) !== 'production') return { lane: 'other', column: 0, label: 'Tests / generated' };
  const backend = /(^|\/)(api|backend|server)\//.test(value);
  const frontend = /(^|\/)(web|frontend|client)\//.test(value);
  if (/(^|\/)(controllers?|resolvers?|routes?)\//.test(value) && !frontend) return { lane: 'backend', column: 0, label: 'Entry / API' };
  if (!frontend && /(^|\/)(connectors?|repositories|repository|persistence|database|db)\//.test(value)) return { lane: 'backend', column: 2, label: 'Integration / persistence' };
  if (!frontend && /(^|\/)(services?|domain|models?|usecases|use-cases)\//.test(value)) return { lane: 'backend', column: 1, label: 'Logic / domain' };
  if (!frontend && /\.(controller|resolver)\.[cm]?[jt]s$/.test(value)) return { lane: 'backend', column: 0, label: 'Entry / API' };
  if (frontend || (!backend && /(^|\/)(pages?|layouts?|components?|hooks?)\//.test(value))) {
    if (/(^|\/)(api|graphql|clients?)\//.test(value)) return { lane: 'frontend', column: 2, label: 'API client' };
    if (/(^|\/)(pages?|layouts?|routes?)\//.test(value) || /\/(page|layout|_app)\.[jt]sx?$/.test(value)) return { lane: 'frontend', column: 0, label: 'Page / layout' };
    if (/(^|\/)(components?|atoms|ui)\//.test(value)) return { lane: 'frontend', column: 2, label: 'Component / UI' };
    if (/(^|\/)(features?|hooks?|state|store|stores)\//.test(value)) return { lane: 'frontend', column: 1, label: 'Feature / state' };
    return { lane: 'frontend', column: 1, label: 'Other frontend source' };
  }
  return { lane: 'other', column: 0, label: 'Unclassified source' };
}

export function architecturePositions(files: { id: string; path: string; height: number }[], pinned: Record<string, { x: number; y: number }> = {}): Record<string, { x: number; y: number }> {
  const positions = { ...pinned };
  const lanes = ['backend', 'frontend', 'other'] as const;
  let laneY = 0;
  for (const lane of lanes) {
    const offsets = [laneY, laneY, laneY];
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      const role = architectureRole(file.path);
      if (role.lane !== lane) continue;
      const x = role.column * 470;
      let y = offsets[role.column];
      if (!pinned[file.id]) {
        let collision = true;
        while (collision) {
          collision = false;
          for (const other of files) {
            const placed = positions[other.id];
            if (other.id !== file.id && placed && x < placed.x + 440 && x + 440 > placed.x && y < placed.y + other.height + 60 && y + file.height + 60 > placed.y) {
              y = placed.y + other.height + 60; collision = true;
            }
          }
        }
        positions[file.id] = { x, y };
      }
      offsets[role.column] = Math.max(offsets[role.column], (positions[file.id]?.y ?? y) + file.height + 70);
    }
    laneY = Math.max(...offsets) + 100;
  }
  return positions;
}
