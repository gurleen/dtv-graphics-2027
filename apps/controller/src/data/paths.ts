/** Reads and writes values inside a plain document by path, without touching the original. */

export type Doc = Readonly<Record<string, unknown>>;
export type Path = readonly string[];

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value);

export function getPath(doc: Doc, path: Path): unknown {
  let value: unknown = doc;
  for (const key of path) {
    if (!isDoc(value)) return undefined;
    value = value[key];
  }
  return value;
}

/** A copy of `doc` with `path` set; `undefined` removes the key, so an optional field can be absent again. */
export function setPath(doc: Doc, path: Path, value: unknown): Doc {
  const [key, ...rest] = path;
  if (key === undefined) return doc;
  const next: Record<string, unknown> = { ...doc };
  const child = rest.length ? setPath(isDoc(doc[key]) ? doc[key] : {}, rest, value) : value;
  if (child === undefined) delete next[key];
  else next[key] = child;
  return next;
}

/** Every leaf of a document, keyed by its dotted path. An array is one leaf; an empty object has none. */
export function leaves(doc: Doc, prefix: Path = []): Map<string, Path> {
  const found = new Map<string, Path>();
  for (const [key, value] of Object.entries(doc)) {
    const path = [...prefix, key];
    if (!isDoc(value)) found.set(path.join('.'), path);
    else for (const [id, leaf] of leaves(value, path)) found.set(id, leaf);
  }
  return found;
}
