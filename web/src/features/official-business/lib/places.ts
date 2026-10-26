/**
 * The OB list's "Where to" facets.
 *
 * A form's destination is free text, so one row may read
 * "Roxas Showroom, Sindangan Showroom" while another says "Sindngan". These
 * helpers split those values, ignore noise words like "Showroom", and (when
 * grouping is on) fold near-identical spellings into one facet.
 */

const GENERIC_WORDS = new Set(["showroom", "branch", "office", "outlet", "store", "shop"]);
const GENERIC_WORD_PATTERN = /\b(showroom|branch|office|outlet|store|shop)\b/gi;

export type PlaceFacet = {
  /** Stable key for selection. In grouped mode this is the first variant key. */
  key: string;
  /** What the filter list shows, e.g. "Roxas". */
  label: string;
  /** Distinct forms containing at least one variant in this facet. */
  count: number;
  /** Every normalized variant key in the facet. */
  keys: string[];
};

export type PlaceForm = {
  id: string;
  destinations: string[];
};

/** Lowercase, strip accents/punctuation, and collapse whitespace. */
export function normalizePlaceText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The matching key for a place: normalized, with noise words removed. */
export function placeKey(value: string) {
  return normalizePlaceText(value)
    .split(/\s+/)
    .filter((token) => token && !GENERIC_WORDS.has(token))
    .join(" ");
}

/**
 * The human label for a place. "Roxas Showroom" becomes "Roxas"; an
 * all-lowercase value like "sindangan" gets a capital first letter.
 */
export function displayPlace(value: string) {
  const stripped = value.replace(GENERIC_WORD_PATTERN, " ").replace(/\s+/g, " ").trim();
  const label = stripped || value.trim().replace(/\s+/g, " ");
  if (!label) return "";
  return label === label.toLowerCase()
    ? label.replace(/\b[a-z]/g, (char) => char.toUpperCase())
    : label;
}

/** Split the free-text To field on commas, semicolons, and line breaks. */
export function splitDestinations(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Every normalized destination key on one form. */
export function destinationKeys(destinations: string[]) {
  const keys = new Set<string>();
  for (const value of destinations) {
    for (const token of splitDestinations(value)) {
      const key = placeKey(token);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

/** Levenshtein distance, used only on the short destination keys. */
function editDistance(a: string, b: string) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** One typo is enough for short names; two for longer ones. */
function similarKeys(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 4) return false;
  return editDistance(a, b) <= (longest <= 6 ? 1 : 2);
}

function mostCommonRaw(counts: Map<string, number>) {
  let best = "";
  let bestCount = -1;
  // Map iteration is first-seen order, so a tie keeps the spelling the forms
  // used first. That usually keeps "Piñan" over a later "Pihan" typo.
  for (const [raw, count] of counts) {
    if (count > bestCount) {
      best = raw;
      bestCount = count;
    }
  }
  return best;
}

function compareFacets(a: PlaceFacet, b: PlaceFacet) {
  return b.count - a.count || a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
}

type Bucket = {
  key: string;
  rawCounts: Map<string, number>;
  formIds: Set<string>;
};

/**
 * Build the place list. Ungrouped mode keeps every normalized spelling apart;
 * grouped mode unions near-identical keys and counts each form once per group.
 */
export function buildPlaceFacets(forms: PlaceForm[], groupSimilar: boolean): PlaceFacet[] {
  const buckets = new Map<string, Bucket>();

  for (const form of forms) {
    const seen = new Set<string>();
    for (const value of form.destinations) {
      for (const token of splitDestinations(value)) {
        const key = placeKey(token);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { key, rawCounts: new Map(), formIds: new Set() };
          buckets.set(key, bucket);
        }
        bucket.rawCounts.set(token, (bucket.rawCounts.get(token) ?? 0) + 1);
        bucket.formIds.add(form.id);
      }
    }
  }

  const all = [...buckets.values()];
  if (!groupSimilar) {
    return all
      .map((bucket) => ({
        key: bucket.key,
        label: mostCommonRaw(bucket.rawCounts),
        count: bucket.formIds.size,
        keys: [bucket.key],
      }))
      .sort(compareFacets);
  }

  const parent = new Map(all.map((bucket) => [bucket.key, bucket.key]));
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let current = key;
    while (parent.get(current) !== root) {
      const next = parent.get(current) ?? root;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      if (a && b && similarKeys(a.key, b.key)) union(a.key, b.key);
    }
  }

  const clusters = new Map<string, Bucket[]>();
  for (const bucket of all) {
    const root = find(bucket.key);
    const cluster = clusters.get(root) ?? [];
    cluster.push(bucket);
    clusters.set(root, cluster);
  }

  return [...clusters.values()]
    .map((cluster) => {
      const rawCounts = new Map<string, number>();
      const formIds = new Set<string>();
      const keys: string[] = [];
      for (const bucket of cluster) {
        keys.push(bucket.key);
        for (const [raw, count] of bucket.rawCounts) {
          rawCounts.set(raw, (rawCounts.get(raw) ?? 0) + count);
        }
        for (const id of bucket.formIds) formIds.add(id);
      }
      const chosen = mostCommonRaw(rawCounts);
      keys.sort();
      return {
        key: keys[0] ?? chosen,
        label: displayPlace(chosen),
        count: formIds.size,
        keys,
      };
    })
    .sort(compareFacets);
}
