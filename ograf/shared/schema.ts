/**
 * The field table is the single source of truth for a graphic's public data model.
 *
 * One table describes both halves of the contract:
 *   - `toJsonSchema()` here emits the OGraf manifest's `schema` (a GDD object, see
 *     docs/ograf/json-schemas/gdd/object.json), which is what an operator UI renders.
 *   - `FieldBinder` in ./binder.ts writes an incoming `data` payload into the bound
 *     Rive view model instance.
 *
 * This module deliberately imports nothing: the package builder runs it under Bun to
 * generate the manifest, where the Rive runtime would not load.
 */

/**
 * `mediaUrl` is a URL the graphic plays itself, outside the Rive scene (for example a
 * video laid over the canvas); the binder leaves it to the graphic class.
 */
export type FieldKind = 'string' | 'number' | 'integer' | 'boolean' | 'color' | 'imageUrl' | 'mediaUrl' | 'select';

export interface Field {
  /** Key in the manifest `schema` and in the `data` payload of load()/updateAction(). */
  name: string;
  /** Rive view model property name. Defaults to `name` when the two agree. */
  property?: string;
  kind: FieldKind;
  /** Label shown in an operator UI. */
  title: string;
  description?: string;
  default?: unknown;
  /** Permitted values; required when `kind` is 'select'. */
  options?: string[];
  /**
   * OGraf `hidden`: the value should not be used when building a display label for
   * the graphic in a playout UI. It is still an editable property.
   */
  hidden?: boolean;
}

type GddProperty = Record<string, unknown>;

const toGddProperty = (field: Field, order: number): GddProperty => {
  const common: GddProperty = { title: field.title, order };
  if (field.description) common.description = field.description;
  if (field.hidden) common.hidden = true;
  if (field.default !== undefined) common.default = field.default;

  switch (field.kind) {
    case 'string':
      return { ...common, type: 'string', gddType: 'single-line' };
    case 'number':
      return { ...common, type: 'number' };
    case 'integer':
      return { ...common, type: 'integer' };
    case 'boolean':
      return { ...common, type: 'boolean' };
    case 'color':
      // GDD pins the pattern for color-rrggbb to this exact string, and requires it.
      return { ...common, type: 'string', gddType: 'color-rrggbb', pattern: '^#[0-9a-f]{6}$' };
    case 'imageUrl':
    case 'mediaUrl':
      // Not GDD's 'file-path/image-path': these are remote CDN URLs, not paths the
      // renderer can browse, so a plain single-line string is the honest description.
      return { ...common, type: 'string', gddType: 'single-line' };
    case 'select': {
      if (!field.options?.length) throw new Error(`Field "${field.name}" is a select with no options`);
      // GDD requires both `enum` and `gddOptions.labels` on a select.
      const labels = Object.fromEntries(field.options.map((option) => [option, option]));
      return { ...common, type: 'string', gddType: 'select', enum: field.options, gddOptions: { labels } };
    }
  }
};

/** The manifest's `schema`: a GDD object describing the `data` payload. */
export const toJsonSchema = (fields: readonly Field[]) => ({
  type: 'object' as const,
  properties: Object.fromEntries(fields.map((field, index) => [field.name, toGddProperty(field, index)])),
});

/** The payload a renderer would send to reproduce the graphic's rest state. */
export const defaultData = (fields: readonly Field[]): Record<string, unknown> =>
  Object.fromEntries(
    fields.filter((field) => field.default !== undefined).map((field) => [field.name, field.default]),
  );
