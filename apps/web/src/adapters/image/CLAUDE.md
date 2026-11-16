# adapters/image

- **`image-probe.adapter.ts`** — `CanvasImageProbeAdapter` (`IImageProbePort`): an image's size and
  blurhash, read when it is attached (`uploadEncryptedAttachmentUseCase`), so they travel in its
  encrypted key and a receiver lays the image out and previews it before it loads.
  `createImageBitmap` decodes it with its EXIF orientation applied — the size an `<img>` shows —,
  then a 32-pixel copy on a canvas is hashed (`blurhash`, 4 × 3 components, 3 × 4 when portrait).
  Anything it can't decode (an SVG, a broken file) answers `null`: the file goes without a preview.
