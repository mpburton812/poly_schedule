const handlers = new Set();

export function onRenderRequest(fn) {
  handlers.add(fn);
}

export function requestRender() {
  handlers.forEach(fn => fn());
}
