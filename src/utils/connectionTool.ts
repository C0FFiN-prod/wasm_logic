import { ConnectMode, type ElementPDO, type Point, type Vector } from "../consts";
import { isInputElement, isOutputElement, LogicElement } from "../logic";
import { circuit, clearSelection, customOverlays, ghostElements } from "../main";
import { getChunkKey, getPointDelta, getPointFromChunkKey } from "./utils";

type ConnectTool = {
  mode: ConnectMode,
  targets: (LogicElement | ElementPDO | null)[],
  sources: Set<(LogicElement | ElementPDO)>[],
  vectors: Vector[],
  coordMap: Map<string, LogicElement | ElementPDO | null>,
  canConnect: boolean
}
export const connectTool: ConnectTool = {
  mode: ConnectMode.NtoN,
  targets: [],
  sources: [new Set(), new Set(), new Set()],
  vectors: [],
  coordMap: new Map(),
  canConnect: false
}

export function initConnectTool(mode: ConnectMode) {
  switch (mode) {
    case ConnectMode.Sequence:
      if (connectTool.targets?.length !== 3) connectTool.targets = Array(3).fill(null)
      if (connectTool.vectors?.length !== 1) connectTool.vectors = Array(1)
      break;
    case ConnectMode.Parallel:
      if (connectTool.targets?.length !== 6) connectTool.targets = Array(6).fill(null)
      if (connectTool.vectors?.length !== 2) connectTool.vectors = Array(2)
      break;
    case ConnectMode.Decoder:
      if (connectTool.targets?.length !== 9) connectTool.targets = Array(9).fill(null)
      if (connectTool.vectors?.length !== 3) connectTool.vectors = Array(3)
      break;
  }
}
export function connectSelected() {
  if (!connectTool.canConnect) return;

  if (connectTool.mode === ConnectMode.NtoN) {
    for (const source of connectTool.sources[0] as Set<LogicElement>) {
      for (const target of connectTool.sources[1] as Set<LogicElement>) {
        if ((!isOutputElement(source)) && (!isInputElement(target))) {
          circuit.addWire(source, target);
        }
      }
    }
  } else if (connectTool.mode === ConnectMode.Sequence) {
    let prevEl: LogicElement | null = null;
    for (const el of connectTool.sources[0] as Set<LogicElement>) {
      if (prevEl !== null) {
        if ((!isOutputElement(prevEl)) && (!isInputElement(el))) {
          circuit.addWire(prevEl, el);
        }
      }
      prevEl = el;
    }
  } else if (connectTool.mode === ConnectMode.Parallel) {
    const sources = (connectTool.sources[0] as Set<LogicElement>).values();
    const targets = (connectTool.sources[1] as Set<LogicElement>).values();
    let source: LogicElement | undefined;
    let target: LogicElement | undefined;
    while ((source = sources.next().value) !== undefined &&
      (target = targets.next().value) !== undefined) {
      if ((!isOutputElement(source)) && (!isInputElement(target))) {
        circuit.addWire(source, target);
      }
    }
  } else if (connectTool.mode === ConnectMode.Decoder) {
    const positives = (connectTool.sources[0] as Set<LogicElement>).values();
    const negatives = (connectTool.sources[1] as Set<LogicElement>).values();
    const targets = (connectTool.sources[2] as Set<LogicElement>);
    let positive: LogicElement | undefined;
    let negative: LogicElement | undefined;
    let i = 1;
    while ((positive = positives.next().value) !== undefined &&
      (negative = negatives.next().value) !== undefined) {
      let j = i, flag = false, source = negative;
      for (const target of targets) {
        if ((!isOutputElement(source)) && (!isInputElement(target))) {
          circuit.addWire(source, target);
        }
        if (--j === 0) {
          flag = !flag;
          source = flag ? positive : negative;
          j = i;
        }

      }
      i <<= 1;
    }
  }
  connectTool.targets.length = 0;
  connectTool.vectors.length = 0;
  ghostElements.clear();
  customOverlays.clear();
  clearSelection();
}
export function disconnectSelected() {
  if (connectTool.mode === ConnectMode.NtoN) {
    for (const source of connectTool.sources[0] as Set<LogicElement>) {
      for (const target of connectTool.sources[1] as Set<LogicElement>) {
        circuit.removeWire(source, target);
      }
    }
  } else if (connectTool.mode === ConnectMode.Sequence) {
    let prevEl: LogicElement | null = null;
    for (const el of connectTool.sources[0] as Set<LogicElement>) {
      if (prevEl !== null) {
        circuit.removeWire(prevEl, el);
      }
      prevEl = el;
    }
  } else if (connectTool.mode === ConnectMode.Parallel) {
    const sources = (connectTool.sources[0] as Set<LogicElement>).entries();
    const targets = (connectTool.sources[1] as Set<LogicElement>).entries();
    let source: LogicElement | undefined;
    let target: LogicElement | undefined;
    while ((source = sources.next().value?.[0]) !== undefined &&
      (target = targets.next().value?.[0]) !== undefined) {
      circuit.removeWire(source, target);
    }
  } else if (connectTool.mode === ConnectMode.Decoder) {
    const positives = (connectTool.sources[0] as Set<LogicElement>).values();
    const negatives = (connectTool.sources[1] as Set<LogicElement>).values();
    const targets = (connectTool.sources[2] as Set<LogicElement>);
    let positive: LogicElement | undefined;
    let negative: LogicElement | undefined;
    let i = 1;
    while ((positive = positives.next().value) !== undefined &&
      (negative = negatives.next().value) !== undefined) {
      let j = i, flag = false, source = negative;
      for (const target of targets) {
        circuit.removeWire(source, target);
        if (--j === 0) {
          flag = !flag;
          source = flag ? positive : negative;
          j = i;
        }
      }
      i <<= 1;
    }
  }
  connectTool.vectors.length = 0;
  connectTool.targets.length = 0;
  ghostElements.clear();
  customOverlays.clear();
  clearSelection();
}
export function makeGhostEl(point: Point): ElementPDO {
  return {
    x: point.x,
    y: point.y,
    color: '777777',
    icon: 'output',
    overlay: 'x',
    overlayColor: 3,
    borderColor: 3,
    value: true
  }
};
export function fillCoordMapWithCoords(point: Point, vector: Point, steps: number) {
  const _point = { x: point.x, y: point.y };
  const addedKeys = [];
  for (let i = 0; i <= steps; ++i) {
    const k = getChunkKey(_point, false);
    connectTool.coordMap.set(k, null);
    addedKeys.push(k);
    _point.x += vector.x;
    _point.y += vector.y;
  }
  return addedKeys;
}

export function fillCTSources(
  keyRows: (string[] | null)[],
  check: (i: number, v: LogicElement) => boolean) {
  connectTool.canConnect = keyRows.every(row => row !== null);
  for (let i = 0; i < keyRows.length; ++i) {
    if (keyRows[i] === null) continue;
    for (const k of keyRows[i]!) {
      let v = connectTool.coordMap.get(k);
      if (v === null) {
        const gEl = makeGhostEl(getPointFromChunkKey(k));
        ghostElements.add(gEl);
        connectTool.coordMap.set(k, gEl);
        connectTool.canConnect = false;
        v = gEl;
      } else if (v instanceof LogicElement) {
        if (check(i, v)) {
          connectTool.canConnect = false;
          customOverlays.set(v, { icon: 'x', color: 3 });
        }
      }
      connectTool.sources[i].add(v!);
    }
  }
}

export function getVectorFrom3Points(point0: Point, point1: Point, pointN: Point): Vector {
  const vector0to1 = getPointDelta(point1, point0);
  const vector0toN = getPointDelta(pointN, point0);
  if (!(vector0to1.x === 0 && vector0to1.y === 0)) {
    let delta: number;
    if (Math.abs(vector0to1.y / vector0to1.x) > 1) {
      delta = Math.floor(Math.abs(vector0toN.y / vector0to1.y));
      if (Math.sign(vector0to1.y) !== Math.sign(vector0toN.y)) delta *= -1;
    } else {
      delta = Math.floor(Math.abs(vector0toN.x / vector0to1.x));
      if (Math.sign(vector0to1.x) !== Math.sign(vector0toN.x)) delta *= -1;
    }
    delta = delta > 0 ? delta : 0;
    return {
      x: vector0to1.x,
      y: vector0to1.y,
      length: delta,
    }
  }
  return { x: 0, y: 0, length: 0 };
}

export function getVectorFrom2Points(point0: Point, point1: Point, length: number) {
  const vector0to1 = getPointDelta(point1, point0);
  if (vector0to1.x !== 0 || vector0to1.y !== 0) {
    return {
      x: vector0to1.x,
      y: vector0to1.y,
      length: length,
    }
  }
  return { x: 0, y: 0, length: 0 };
}
