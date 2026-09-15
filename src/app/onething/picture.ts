// The picture a phone picks is a 3 MB photo; what the site needs is a small
// square. Crop to the centre square and scale it down here, in the browser,
// so a JPEG of a few dozen KB is what travels and the server never resizes.
export async function squareJpeg(file: File, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => no(new Error('That file is not a picture.'))
      i.src = url
    })
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    if (!s) throw new Error('That file is not a picture.')
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('Could not read that picture.')
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size)
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Could not read that picture.'))), 'image/jpeg', 0.86))
  } finally {
    URL.revokeObjectURL(url)
  }
}
