import { gridSize, type Camera, type Point } from "./consts";
import type { Circuit, LogicElement } from "./logic";

// Конвертирует Hex (#RRGGBB) в [R, G, B] (0-255)
export function hexToRgb(hex: string): [number, number, number] {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
    return "#"+r.toString(16)+g.toString(16)+b.toString(16);
}

export function luminance(r: number, g: number, b: number): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function lightness(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max + min) / 510;
}
// === Вспомогательные ===

export function setupEvent(id: string, event: string, handler: (e: Event) => void) {
  const element = document.getElementById(id);
  if (element) {
    (element as any)[event] = handler;
  } else {
    console.warn(`Element with id "${id}" not found`);
  }
}

export function screenToWorld(camera:Camera, sx: number, sy: number) {
  const h = camera.zoom * gridSize;
  return {
    x: (camera.x + sx) / h,
    y: (camera.y + sy) / h
  };
}

export function worldToTranslatedScreen(camera:Camera, wx: number, wy: number): Point {
  return {
    x: wx * gridSize,
    y: wy * gridSize
  };
}

export function worldToScreen(camera:Camera, wx: number, wy: number): Point {
  const h = camera.zoom * gridSize;
  return {
    x: (wx * h - camera.x),
    y: (wy * h - camera.y)
  };
}

// ====Выбор\выделение====
export function getSelectionWorldRect(camera: Camera, selectionStart: Point, selectionEnd:Point) {
  const p1 = screenToWorld(camera, selectionStart.x, selectionStart.y);
  const p2 = screenToWorld(camera, selectionEnd.x, selectionEnd.y);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p1.x - p2.x),
    height: Math.abs(p1.y - p2.y)
  };
}

export function getElementsInRect(circuit: Circuit, rect: { x: number; y: number; width: number; height: number; }) {
  const selected = new Set<LogicElement>();
  for (const obj of circuit.elements) {
    const objX = obj.x;
    const objY = obj.y;
    if (
      objX + 1 >= rect.x &&
      objX <= rect.x + rect.width &&
      objY + 1 >= rect.y &&
      objY <= rect.y + rect.height
    ) {
      selected.add(obj);
    }
  }
  return selected;
}

export function getElementAt(circuit: Circuit, camera: Camera, screenX: number, screenY: number) {
  const { x: wx, y: wy } = screenToWorld(camera, screenX, screenY);
  for (const obj of circuit.elements) {
    const ox = obj.x;
    const oy = obj.y;
    if (
      ox <= wx && wx < ox + 1 &&
      oy <= wy && wy < oy + 1
    ) {
      return obj;
    }
  }
  return null;
}

export function clamp(value: number, lower: number, upper: number) {
  return Math.min(Math.max(value, lower), upper);
}