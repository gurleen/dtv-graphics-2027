/**
 * Writes OGraf `data` payloads into a bound Rive view model instance.
 *
 * The property-by-property calls are the Rive runtime's own view model calls; the only
 * addition is that a missing key is skipped rather than written, which is what makes
 * updateAction() a partial update.
 */

import { decodeImage, type ViewModelInstance } from '@rive-app/canvas-single';
import type { Field } from './schema';

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const hexToRgb = (hex: string) =>
  [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as const;

type DecodedImage = Awaited<ReturnType<typeof decodeImage>>;

export class FieldBinder {
  private readonly byName: Map<string, Field>;
  /**
   * Not an optimisation: the engine holds a reference to every decoded image until
   * unref(), so decoding the same logo on each update leaks one image per update.
   */
  private readonly images = new Map<string, Promise<DecodedImage>>();
  private disposed = false;

  constructor(fields: readonly Field[]) {
    this.byName = new Map(fields.map((field) => [field.name, field]));
  }

  /**
   * Writes every recognised key of `data` into the instance. Absent keys are left
   * alone. Resolves once pending image decodes have settled; the scalar writes have
   * already landed by then.
   */
  async apply(instance: ViewModelInstance, data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') return;

    const pending: Promise<void>[] = [];
    for (const [name, value] of Object.entries(data as Record<string, unknown>)) {
      const field = this.byName.get(name);
      if (!field || value === undefined || value === null) continue;
      const property = field.property ?? field.name;

      switch (field.kind) {
        case 'string':
        case 'select': {
          const target = instance.string(property);
          if (target) target.value = String(value);
          break;
        }
        case 'number':
        case 'integer': {
          const target = instance.number(property);
          const parsed = Number(value);
          if (target && Number.isFinite(parsed)) target.value = parsed;
          break;
        }
        case 'boolean': {
          const target = instance.boolean(property);
          if (target) target.value = Boolean(value);
          break;
        }
        case 'color': {
          const target = instance.color(property);
          const hex = String(value);
          if (target && COLOR_PATTERN.test(hex)) target.rgb(...hexToRgb(hex));
          break;
        }
        case 'imageUrl': {
          const url = String(value);
          if (url) pending.push(this.applyImage(instance, property, url));
          break;
        }
        case 'mediaUrl':
          // Played by the graphic class, not the scene; see RiveGraphicElement.onDataApplied.
          break;
      }
    }
    // One unreachable logo must not fail the whole update.
    await Promise.allSettled(pending);
  }

  private async applyImage(instance: ViewModelInstance, property: string, url: string): Promise<void> {
    let decoding = this.images.get(url);
    if (!decoding) {
      decoding = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return response.arrayBuffer();
        })
        .then((bytes) => decodeImage(new Uint8Array(bytes)));
      // Do not cache a failure; the next update should retry the fetch.
      decoding.catch(() => this.images.delete(url));
      this.images.set(url, decoding);
    }

    let image: DecodedImage;
    try {
      image = await decoding;
    } catch (error) {
      console.error(`OGraf: could not load the image for "${property}" from ${url}`, error);
      throw error;
    }
    if (this.disposed) return;
    const target = instance.image(property);
    if (target) target.value = image;
  }

  /** Releases every decoded image. Called from the graphic's dispose(). */
  dispose(): void {
    this.disposed = true;
    for (const decoding of this.images.values()) {
      decoding.then((image) => image.unref(), () => {});
    }
    this.images.clear();
  }
}
