// A tiny document for rendering the unified screens in Node tests. It supports what
// src/ui/dom.js uses (elements, SVG elements, text, attributes, listeners) plus a few
// finders. It is not a browser: layout, CSS and events beyond click are out of scope.

class FakeNode {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.ownText = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  click() { for (const fn of this.listeners.get('click') ?? []) fn({ preventDefault() {}, currentTarget: this, target: this }); }
  set textContent(value) { this.children = []; this.ownText = String(value); }
  get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(''); }
  /** Every descendant, in document order. */
  all() { return this.children.flatMap((c) => (c instanceof FakeNode ? [c, ...c.all()] : [])); }
  /** Descendants matching a predicate. */
  find(pred) { return this.all().filter(pred); }
  hasClass(name) { return String(this.className).split(/\s+/).includes(name); }
}

class FakeText {
  constructor(text) { this.text = String(text); }
  get textContent() { return this.text; }
}

export function createFakeDocument() {
  const doc = {
    createElement: (tag) => new FakeNode(doc, tag),
    createElementNS: (_ns, tag) => new FakeNode(doc, tag),
    createTextNode: (text) => new FakeText(text),
  };
  return doc;
}

/** Wraps rendered output (a node or an array of nodes) so tests can search it. */
export function root(doc, rendered) {
  const box = doc.createElement('div');
  for (const node of [rendered].flat(Infinity)) if (node) box.append(node);
  return box;
}
