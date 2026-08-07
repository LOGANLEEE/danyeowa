/** Converts a base64url-encoded VAPID public key (as served by GET /api/push/config)
 * into the Uint8Array `applicationServerKey` format `pushManager.subscribe` requires.
 * Returns a plain-ArrayBuffer-backed view (not the wider ArrayBufferLike a fresh
 * Uint8Array's `.buffer` is typed as) to satisfy `applicationServerKey`'s BufferSource
 * constraint — the same fix used in worker/src/webpush.ts's `toBufferSource`. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
