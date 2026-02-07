import { chunkSize, gridSize, type Camera, type ElementPDO, type Point, type Rect } from "../consts";
import { LogicElement, type Circuit } from "../logic";

export function formatString(template: string, args: any[]): string {
  return template.replace(/%(\d+)/g, (match: string, index: string) => {
    const i = parseInt(index, 10) - 1;
    return i >= 0 && i < args.length ? args[i] : match;
  });
}

// Конвертирует Hex (#RRGGBB) в [R, G, B] (0-255)
export function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" +
    clamp(Math.round(r), 0, 255).toString(16).padStart(2, '0') +
    clamp(Math.round(g), 0, 255).toString(16).padStart(2, '0') +
    clamp(Math.round(b), 0, 255).toString(16).padStart(2, '0');
}

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b);
}

export function lightness(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max + min) / 2;
}
// === Вспомогательные ===

export function setupEvent(id: string, event: string, handler: (e: Event) => void) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    console.warn(`Element with id "${id}" not found`);
  }
}

export function screenToWorld(camera: Camera, sx: number, sy: number) {
  const h = camera.zoom * gridSize;
  return {
    x: (camera.x + sx) / h,
    y: (camera.y + sy) / h
  };
}

export function worldToTranslatedScreen(camera: Camera, wx: number, wy: number): Point {
  return {
    x: wx * gridSize,
    y: wy * gridSize
  };
}

export function worldToScreen(camera: Camera, wx: number, wy: number): Point {
  const h = camera.zoom * gridSize;
  return {
    x: (wx * h - camera.x),
    y: (wy * h - camera.y)
  };
}

// ====Выбор\выделение====
export function getSelectionWorldRect(camera: Camera, selectionStart: Point, selectionEnd: Point) {
  const p1 = screenToWorld(camera, selectionStart.x, selectionStart.y);
  const p2 = screenToWorld(camera, selectionEnd.x, selectionEnd.y);
  return {
    x0: Math.min(p1.x, p2.x),
    y0: Math.min(p1.y, p2.y),
    x1: Math.max(p1.x, p2.x),
    y1: Math.max(p1.y, p2.y)
  };
}

export function getElementsInRect(circuit: Circuit, rect: Rect) {
  const selected = [];
  const selectionRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const chunks = [];
  const x0 = Math.floor(rect.x0 / chunkSize), x1 = Math.floor(rect.x1 / chunkSize);
  const y0 = Math.floor(rect.y0 / chunkSize), y1 = Math.floor(rect.y1 / chunkSize);
  for (let x = x0; x <= x1; ++x) {
    for (let y = y0; y <= y1; ++y) {
      const chunk = circuit.getChunk({ x, y }, false);
      if (chunk && chunk.size > 0) {
        if (x === x0 || x === x1 || y === y0 || y === y1)
          chunks.push(chunk);
        else selected.push(...chunk);
      }
    }
  }
  for (const chunk of chunks) {
    for (const obj of chunk) {
      const objX = obj.x;
      const objY = obj.y;
      if (
        objX + 1 >= rect.x0 &&
        objX <= rect.x1 &&
        objY + 1 >= rect.y0 &&
        objY <= rect.y1
      ) {
        selected.push(obj);
        selectionRect.x0 = Math.min(obj.x, selectionRect.x0);
        selectionRect.y0 = Math.min(obj.y, selectionRect.y0);
        selectionRect.x1 = Math.max(obj.x, selectionRect.x1);
        selectionRect.y1 = Math.max(obj.y, selectionRect.y1);
      }
    }
  }
  return { selected, selectionRect };
}

export function getElementAt(circuit: Circuit, camera: Camera, point: Point, isScreen: boolean) {
  let x: number, y: number;
  if (isScreen)
    ({ x, y } = screenToWorld(camera, point.x, point.y));
  else ({ x, y } = point);
  const chunk = circuit.getChunk({ x, y }, true);
  if (!chunk) return null;
  for (const obj of chunk) {
    const ox = obj.x;
    const oy = obj.y;
    if (
      ox <= x && x < ox + 1 &&
      oy <= y && y < oy + 1
    ) {
      return obj;
    }
  }
  return null;
}

export function fillCoordMapWithElements(circuit: Circuit, coordMap: Map<string, LogicElement | ElementPDO | null>) {
  if (coordMap.size === 0) return;
  const usedChunks = new Map<string, null | Set<LogicElement>>();
  for (const coord of coordMap.keys()) {
    const point = getPointFromChunkKey(coord);
    const key = getChunkKey(point, true);
    if (!usedChunks.has(key))
      usedChunks.set(key, circuit.chunks.get(key) || null);
  }
  for (const chunk of usedChunks.values()) {
    if (chunk === null) continue;
    for (const obj of chunk) {
      const key = getChunkKey(obj, false);
      if (coordMap.has(key)) {
        coordMap.set(key, obj);
      }
    }
  }
}

export function clamp(value: number, lower: number, upper: number) {
  return Math.min(Math.max(value, lower), Math.max(upper, lower));
}

export function getChunkKey(point: Point, doDivide: boolean) {
  const chunkX = doDivide ? Math.floor(point.x / chunkSize) : point.x;
  const chunkY = doDivide ? Math.floor(point.y / chunkSize) : point.y;
  return `${chunkX}|${chunkY}`;
}

export function getPointFromChunkKey(key: string): Point {
  const coords = key.split('|');
  return { x: Number(coords[0]), y: Number(coords[1]) };
}

export function getPointDelta(point1: Point, point2: Point): Point {
  return { x: point1.x - point2.x, y: point1.y - point2.y };
}

export function getScale() {
  return window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
}