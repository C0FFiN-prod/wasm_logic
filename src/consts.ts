import { ruLocale, enLocale, plLocale } from "./locales";

export const typeToshapeId: Map<string, string> = new Map(Object.entries({
  "GATE": "9f0f56e8-2c31-4d83-996c-d00a9b296c3f",
  "TIMER": "8f7fd0e7-c46e-4944-a414-7ce2437bb30f",
  "SWITCH": "7cf717d7-d167-4f2d-a6e7-6b2c70aa3986",
  "BUTTON": "1e8d93a4-506b-470d-9ada-9c0a321e2db5",
  "OUTPUT": "ed27f5e2-cac5-4a32-a5d9-49f116acc6af"
}))

export const shapeIdToType = new Map(typeToshapeId.entries().map(([k, v]) => [v, k]));
export const knownShapeIds = new Set(typeToshapeId.values());

export const colors: Record<string, vec4> = {
  background: [0, 0, 0, 1],
  grid: [0, 0, 0, 1],
  on: [0.066, 0.332, 0.797, 1],
  off: [0.2, 0.2, 0.2, 1],
  wires: [0.531, 0.531, 0.531, 1],
  tempWires: [1, 0.664, 0, 1],
  border: [0.332, 0.332, 0.332, 1],
  selection: [0.066, 0.598, 1, 1],
  source: [0, 1, 0, 1],
  target: [1, 0, 0, 1],
  paint: [1, 0, 1, 1],
}
export const borderPalette = [
  84, 84, 84, //border
  16, 152, 255, //selection
  0, 255, 0, //source | IN
  255, 0, 0, //target | OUT
  255, 255, 0, //self-wired | SW
  255, 0, 255, //paint
  0, 255, 255, // X
  204, 68, 68, // A0 | A1 | An
  68, 68, 204, // B0 | B1 | Bn
  68, 204, 68, // R0 | R1 | Rn
]
export const overlayColorIndexes = [0, 6, 4, 2, 3, 7, 7, 7, 8, 8, 8, 9, 9, 9];
export const textColors = ['#545454','#1098ff','#0F0', '#F00', '#FF0', '#F0F', '#0FF', '#C44', '#44C', '#4C4',];
export const texts = ['X', 'SW', 'IN', 'OUT', 'A0', 'A1', 'An', 'B0', 'B1', 'Bn', 'R0', 'R1', 'Rn'];


export const gateTypeToMode = new Map<string, number>(Object.entries({
  'AND': 0,
  'OR': 1,
  'XOR': 2,
  'NAND': 3,
  'NOR': 4,
  'XNOR': 5,
  'T_FLOP': 6,
}));
export const gateModeToType = new Map(gateTypeToMode.entries().map(([k, v]) => [v, k]));

export const ToolMode = {
  Cursor: 0,
  Connect: 1,
  Paint: 2
} as const;
export const ConnectMode = {
  NtoN: 0,
  Sequence: 1,
  Parallel: 2,
  Decoder: 3,
} as const;
export const CopyWiresMode = {
  None: 0,
  Inner: 1,
  All: 2
} as const;
export const ShowWiresMode = {
  None: 0,
  Connect: 1,
  Temporary: 2,
  Always: 3
} as const;

export const locales = {
  ru: ruLocale,
  en: enLocale,
  pl: plLocale,
}
export const Themes = ['system', 'light' , 'dark'] as const;
export const Drawings = ['webgl', 'canvas'] as const;
export type LocaleNames = keyof typeof locales
export type Themes = (typeof Themes)[number];
export type Drawings = (typeof Drawings)[number];

export type ConnectMode = typeof ConnectMode[keyof typeof ConnectMode];
export type CopyWiresMode = typeof CopyWiresMode[keyof typeof CopyWiresMode];
export type ShowWiresMode = typeof ShowWiresMode[keyof typeof ShowWiresMode];
export type ToolMode = typeof ToolMode[keyof typeof ToolMode];
export type Camera = { x: number, y: number, zoom: number };
export type Point = { x: number, y: number };
export type Vector = { x: number, y: number, length: number};
export type Rect = { x0: number, y0: number, x1: number, y1: number };
export type ElementPDO = { x: number, y: number, color: string, icon: string, overlay: string, overlayColor: number, borderColor: number, value: boolean };
export const gridSize = 20;
export const chunkSize = 16;
export const chunkMargin = 2;
export const minZoom = 0.35;
export const maxZoom = 25;
export type vec3 = [number, number, number];
export type vec4 = [number, number, number, number];