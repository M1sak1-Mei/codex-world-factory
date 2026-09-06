/** Curated compositions are data, not another scene renderer or generator. */
export const WORLD_SHOWCASES = {
  'enchanted-river': {
    label: '魔法森林河谷',
    parameters: {
      world: 'magic-forest-ruins', terrain: 'folded-ranges', landscape: 'wild',
      seed: '42', season: 'summer', T: '15.8',
      include: 'forest,wetland,shrubs,flowers', exclude: 'desert,snow,cobble,concrete',
    },
  },
  'autumn-river': {
    label: '秋日森林河谷',
    parameters: {
      world: 'wilderness', terrain: 'folded-ranges', landscape: 'wild',
      seed: '42', season: 'autumn', T: '15.8',
      include: 'forest,wetland,shrubs', exclude: 'desert,snow,cobble,concrete',
    },
  },
  'oasis-sanctuary': {
    label: '沙丘绿洲',
    parameters: {
      world: 'wilderness', terrain: 'dune-oasis', landscape: 'oasis',
      seed: '73', season: 'summer', T: '15',
      include: 'desert,cacti,wetland', exclude: 'cobble,concrete,snow',
    },
  },
} as const;

export type WorldShowcaseId = keyof typeof WORLD_SHOWCASES;

/** Explicit parameters, including intentionally empty include/exclude, win. */
export function resolveShowcaseParameters(search: string): URLSearchParams {
  const q = new URLSearchParams(search);
  const id = q.get('showcase');
  if (id && Object.hasOwn(WORLD_SHOWCASES, id)) {
    for (const [key, value] of Object.entries(WORLD_SHOWCASES[id as WorldShowcaseId].parameters)) {
      if (!q.has(key)) q.set(key, value);
    }
  }
  return q;
}
