// Geometry of the edge button and the drawer.
//
// The logo button sits on one edge of the window. The drawer opens from the
// same side for the left and right edges; for the top and bottom edges it
// opens from the left, so it never covers Etsy's header or the page bottom.

export const TAB_LONG = 64; // button length along the edge
export const TAB_SHORT = 46; // button depth into the page
export const DRAWER_WIDTH = 384; // template.primitive.sheet: sm:max-w-sm
export const DRAWER_WIDTH_NARROW = 360;
export const NARROW_VIEWPORT = 1100;
const EDGE_MARGIN = 8;

/** Side the drawer slides in from for a given button edge. */
export function drawerSide(edge) {
  return edge === 'right' ? 'right' : 'left';
}

/** Drawer width for a viewport width. */
export function drawerWidth(viewportWidth) {
  return viewportWidth < NARROW_VIEWPORT ? DRAWER_WIDTH_NARROW : DRAWER_WIDTH;
}

/**
 * Pixel box of the edge button. `offset` (0..1) is the position along the
 * edge; the box is clamped so it never leaves the viewport.
 */
export function tabRect(edge, offset, viewport) {
  const vertical = edge === 'left' || edge === 'right';
  const length = vertical ? viewport.height : viewport.width;
  const span = Math.max(0, length - TAB_LONG - EDGE_MARGIN * 2);
  const along = EDGE_MARGIN + Math.round(span * Math.min(1, Math.max(0, offset)));
  if (vertical) {
    return { x: edge === 'left' ? 0 : viewport.width - TAB_SHORT, y: along, width: TAB_SHORT, height: TAB_LONG };
  }
  return { x: along, y: edge === 'top' ? 0 : viewport.height - TAB_SHORT, width: TAB_LONG, height: TAB_SHORT };
}

/**
 * Where a dragged button lands: the nearest edge to the pointer, and the
 * pointer's position along that edge as a 0..1 offset.
 */
export function snapToEdge(point, viewport) {
  const distances = {
    left: point.x,
    right: viewport.width - point.x,
    top: point.y,
    bottom: viewport.height - point.y,
  };
  const edge = Object.keys(distances).reduce((a, b) => (distances[b] < distances[a] ? b : a));
  const vertical = edge === 'left' || edge === 'right';
  const length = vertical ? viewport.height : viewport.width;
  const coordinate = vertical ? point.y : point.x;
  const span = Math.max(1, length - TAB_LONG - EDGE_MARGIN * 2);
  const offset = Math.min(1, Math.max(0, (coordinate - TAB_LONG / 2 - EDGE_MARGIN) / span));
  return { edge, offset: Math.round(offset * 1000) / 1000, side: drawerSide(edge) };
}
