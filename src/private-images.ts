export const PRIVATE_IMAGE_ATTR = 'data-orion-private-image'

// 1x1 transparent GIF. Private images keep their real bytes only on the local device.
// The cloud workspace stores this harmless placeholder plus an opaque attachment id.
export const PRIVATE_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

const PRIVATE_IMAGE_ID = /^[A-Za-z0-9_-]{40,64}$/

export function isPrivateImageId(value: string) {
  return PRIVATE_IMAGE_ID.test(value)
}

export function privateImageIdsFromHtml(html: string) {
  const ids = new Set<string>()
  const pattern = /data-orion-private-image=(?:"([^"]+)"|'([^']+)')/g
  for (const match of html.matchAll(pattern)) {
    const id = match[1] || match[2] || ''
    if (isPrivateImageId(id)) ids.add(id)
  }
  return [...ids]
}
