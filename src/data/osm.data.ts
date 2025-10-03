export const OSM_TAG_TO_TYPE: Record<string, Record<string, string>> = {
  natural: {
    peak: 'mountain',
    waterfall: 'waterfall',
    cave_entrance: 'cave_entrance',
    glacier: 'glacier',
    bay: 'bay',
    wood: 'wood',
    forest: 'forest',
    beach: 'beach',
  },
  water: {
    lake: 'lake',
    reservoir: 'reservoir',
  },
  leisure: {
    nature_reserve: 'nature_reserve',
    park: 'park',
  },
  boundary: {
    national_park: 'national_park',
    protected_area: 'protected_area',
  },
  tourism: {
    viewpoint: 'viewpoint',
  },
  route: {
    hiking: 'hiking_route',
  },
  place: {
    island: 'island',
  },
}

export const OSM_FILTERS = {
  requireName: ['wood', 'forest', 'park', 'island'],

  minArea: {
    park: 500000,
    wood: 100000,
    forest: 100000,
  },

  requireTags: {
    hiking_route: ['ref'],
  },

  boostIfInProtectedArea: ['beach', 'bay', 'wood', 'forest'],
}
