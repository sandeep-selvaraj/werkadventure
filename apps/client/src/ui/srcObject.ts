/** Svelte action: bind a MediaStream to a <video>/<audio> element. */
export function srcObject(el: HTMLMediaElement, stream: MediaStream | null) {
  const set = (s: MediaStream | null) => {
    if (el.srcObject !== s) el.srcObject = s;
    if (s) el.play().catch(() => {});
  };
  set(stream);
  return { update: set };
}
