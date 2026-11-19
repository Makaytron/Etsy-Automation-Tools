// Small DOM helpers. Text always goes through textContent, never innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('button', { class: 'x', onclick: fn, 'aria-label': 'y' }, child, 'text') */
export function h(doc, tag, props = {}, ...children) {
  const el = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'string' ? parent.ownerDocument.createTextNode(child) : child);
  }
  return parent;
}

/** Inline SVG icon from lucide-style path data (24×24, stroke). */
export function icon(doc, paths, size = 16) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
    svg.setAttribute(k, String(v));
  }
  for (const [tag, attrs] of paths) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }
  return svg;
}
