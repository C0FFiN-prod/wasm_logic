import { ConnectMode, type ElementPDO, type Point, type Vector } from "../consts";
import { isInputElement, isOutputElement, LogicElement, Wire } from "../logic";
import { camera, circuit, clearSelections, customOverlays, ghostElements } from "../main";
import { fillCoordMapWithElements, getChunkKey, getElementAt, getPointDelta, getPointFromChunkKey } from "./utils";
export type ConnectToolTarget = LogicElement | ElementPDO | null;
type ConnectTool = {
  mode: ConnectMode,
  targets: ConnectToolTarget[],
  sources: Set<(LogicElement | ElementPDO)>[],
  vectors: Vector[],
  coordMap: Map<string, ConnectToolTarget>,
  canConnect: boolean
}
const ConnectModeParams = {
  0: {},
  1: { vectors: 1, targets: 3 },
  2: { vectors: 2, targets: 6 },
  3: { vectors: 3, targets: 9 },
} as const;
const OverlayIconNames = ['a0', 'a1', 'an', 'b0', 'b1', 'bn', 'r0', 'r1', 'rn'];

export const connectTool: ConnectTool = {
  mode: ConnectMode.NtoN,
  targets: [],
  sources: [new Set(), new Set(), new Set()],
  vectors: [],
  coordMap: new Map(),
  canConnect: false
}

/**
* Инициализация инструмента (вызывается извне)
*/
export function initConnectTool(mode: ConnectMode) {
  connectTool.mode = mode;
  switch (mode) {
    case ConnectMode.NtoN:
      connectTool.canConnect = true;
      break;
    case ConnectMode.Sequence:
    case ConnectMode.Parallel:
    case ConnectMode.Decoder:
      connectTool.canConnect = false;
      if (connectTool.targets?.length !== ConnectModeParams[mode].targets) {
        connectTool.targets = Array(ConnectModeParams[mode].targets);
        connectTool.targets.fill(null);
      }
      if (connectTool.vectors?.length !== ConnectModeParams[mode].vectors) {
        connectTool.vectors = Array(ConnectModeParams[mode].vectors);
        connectTool.vectors.forEach(v => { v.x = 0; v.y = 0; v.length = 0; });
      }
      break;

  }
}
export function connectSelected() {
  if (!connectTool.canConnect) return;
  const wires: Wire[] = [];
  if (connectTool.mode === ConnectMode.NtoN) {
    for (const source of connectTool.sources[0] as Set<LogicElement>) {
      for (const target of connectTool.sources[1] as Set<LogicElement>) {
        if ((!isOutputElement(source)) && (!isInputElement(target))) {
          addWire(wires, source, target);
        }
      }
    }
  } else if (connectTool.mode === ConnectMode.Sequence) {
    let prevEl: LogicElement | null = null;
    for (const el of connectTool.sources[0] as Set<LogicElement>) {
      if (prevEl !== null) {
        if ((!isOutputElement(prevEl)) && (!isInputElement(el))) {
          addWire(wires, prevEl, el);
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
        addWire(wires, source, target);
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
          addWire(wires, source, target);
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
  clearConnectTool();
  return wires;
}
export function disconnectSelected() {
  const wires: Wire[] = [];
  if (connectTool.mode === ConnectMode.NtoN) {
    for (const source of connectTool.sources[0] as Set<LogicElement>) {
      for (const target of connectTool.sources[1] as Set<LogicElement>) {
        removeWire(wires, source, target);
      }
    }
  } else if (connectTool.mode === ConnectMode.Sequence) {
    let prevEl: LogicElement | null = null;
    for (const el of connectTool.sources[0] as Set<LogicElement>) {
      if (prevEl !== null) {
        removeWire(wires, prevEl, el);
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
      removeWire(wires, source, target);
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
        removeWire(wires, source, target);
        if (--j === 0) {
          flag = !flag;
          source = flag ? positive : negative;
          j = i;
        }
      }
      i <<= 1;
    }
  }
  clearConnectTool();
  return wires;
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

function addWire(wires: Wire[], source: LogicElement, target: LogicElement) {
  let wire;
  if ((wire = circuit.addWire(source, target)) !== undefined)
    wires.push(wire);
}

function removeWire(wires: Wire[], source: LogicElement, target: LogicElement) {
  let wire;
  if ((wire = circuit.removeWire(source, target)) !== undefined)
    wires.push(wire);
}

/**
* Основной обработчик клика по элементу
*/
export function handleElementClick(el: ConnectToolTarget, index?: number) {
  connectTool.canConnect = false;
  ghostElements.clear();
  switch (connectTool.mode) {
    case ConnectMode.NtoN:
      return null;
    case ConnectMode.Sequence:
      return handleSequence(el, index);
    case ConnectMode.Parallel:
      return handleParallel(el, index);
    case ConnectMode.Decoder:
      return handleDecoder(el, index);
  }
}

export function processConnectToolMode() {
  clearModeState();
  ghostElements.clear();
  for (const [i, el] of connectTool.targets.entries()) setOverlay(i, el);
  switch (connectTool.mode) {
    case ConnectMode.NtoN: break;
    case ConnectMode.Sequence: processSequence(); break;
    case ConnectMode.Parallel: processParallel(); break;
    case ConnectMode.Decoder: processDecoder(); break;
  }
}

// ==================== Sequence Mode ====================

function handleSequence(el: ConnectToolTarget, targetIndex: number | undefined): { element: ConnectToolTarget, index: number } {
  const elIndex = resolveTargetIndex(el, targetIndex);
  clearModeState();
  let dump;
  if (elIndex === -1) {
    // Добавление элемента
    const nullIndex = findNullIndexForSequence(elIndex);
    const oldTarget = setTargetWithOverlay(nullIndex, el);

    dump = { element: oldTarget, index: targetIndex ?? nullIndex };
  } else {
    // Удаление элемента
    dump = { element: removeTarget(elIndex), index: elIndex };
  }
  processSequence();
  return dump;
}

function processSequence() {
  // Авто-поиск конечного элемента если все 3 точки выбраны
  if (connectTool.targets[0] && connectTool.targets[1] && connectTool.targets[2]) {
    autoFindEndElement(0, 1, 2, 'an', 7);
  }

  updateSequenceSources();
}

function findNullIndexForSequence(elIndex: number): number {
  let nullIndex = connectTool.targets.indexOf(null);
  if (nullIndex === -1 || elIndex === 2) {
    replaceTarget(2);
    nullIndex = 2;
  }
  return nullIndex;
}


function updateSequenceSources(): void {
  const rows: (string[] | null)[] = [
    connectTool.vectors[0]?.length
      ? fillCoordMapWithCoords(connectTool.targets[0]!, connectTool.vectors[0], connectTool.vectors[0].length)
      : null
  ];
  fillCoordMapWithElements(circuit, connectTool.coordMap);

  const check = (_: number, v: LogicElement) => {
    return (connectTool.sources[0].size !== 0 && isInputElement(v)) ||
      (connectTool.sources[0].size !== connectTool.coordMap.size - 1 && isOutputElement(v));
  };
  fillCTSources(rows, check);
}

// ==================== Parallel Mode ====================

function handleParallel(el: ConnectToolTarget, targetIndex: number | undefined): { element: ConnectToolTarget, index: number } {
  const elIndex = resolveTargetIndex(el, targetIndex);
  clearModeState();
  let dump;
  if (elIndex === -1 || elIndex === 5) {
    const nullIndex = findNullIndexForParallel(elIndex);
    const oldTarget = setTargetWithOverlay(nullIndex, el);

    dump = { element: oldTarget, index: targetIndex ?? nullIndex };
  } else {
    dump = { element: removeTarget(elIndex), index: elIndex };
  }
  processParallel();
  return dump;
}

function processParallel() {
  // Авто-поиск для шины источника
  if (connectTool.targets[0] && connectTool.targets[1] && connectTool.targets[2]) {
    autoFindEndElement(0, 1, 2, 'an', 7);
  }

  // Авто-поиск для шины приемника
  if (connectTool.targets[3] && connectTool.targets[4]) {
    autoFindEndElement(3, 4, 5, 'bn', 8, connectTool.vectors[0].length);
  } else {
    replaceTarget(5);
  }

  updateParallelSources();
}

function findNullIndexForParallel(elIndex: number): number {
  let nullIndex = connectTool.targets.indexOf(null);
  if (nullIndex === -1 || nullIndex === 5 || elIndex === 5) {
    replaceTarget(4);
    replaceTarget(5);
    nullIndex = 4;
  }
  return nullIndex;
}

function updateParallelSources(): void {
  const rows: (string[] | null)[] = [
    connectTool.vectors[0]?.length
      ? fillCoordMapWithCoords(connectTool.targets[0]!, connectTool.vectors[0], connectTool.vectors[0].length)
      : null,
    connectTool.vectors[1]?.length
      ? fillCoordMapWithCoords(connectTool.targets[3]!, connectTool.vectors[1], connectTool.vectors[1].length)
      : null
  ];
  fillCoordMapWithElements(circuit, connectTool.coordMap);

  const check = (i: number, v: LogicElement) => {
    return (i === 0 && isOutputElement(v)) ||
      (i === 1 && isInputElement(v));
  };
  fillCTSources(rows, check);
}

// ==================== Decoder Mode ====================

function handleDecoder(el: ConnectToolTarget, targetIndex: number | undefined): { element: ConnectToolTarget, index: number } {
  const elIndex = resolveTargetIndex(el, targetIndex);
  clearModeState();
  let dump;
  if (elIndex === -1 || elIndex === 5 || elIndex === 8) {
    const nullIndex = findNullIndexForDecoder(elIndex);
    const oldTarget = setTargetWithOverlay(nullIndex, el);

    dump = { element: oldTarget, index: targetIndex ?? nullIndex };
  } else {
    dump = { element: removeTarget(elIndex), index: elIndex };
  }
  processDecoder();
  return dump;
}

function processDecoder() {
  // Авто-поиск для 3 линий (A, B, R)
  if (connectTool.targets[0] && connectTool.targets[1] && connectTool.targets[2]) {
    autoFindEndElement(0, 1, 2, 'an', 7);
  }
  if (connectTool.targets[3] && connectTool.targets[4]) {
    autoFindEndElement(3, 4, 5, 'bn', 8, connectTool.vectors[0].length);
  }
  if (connectTool.targets[6] && connectTool.targets[7]) {
    autoFindEndElement(6, 7, 8, 'rn', 9, Math.pow(2, connectTool.vectors[0].length + 1) - 1);
  }

  updateDecoderSources();
}

function findNullIndexForDecoder(elIndex: number): number {
  let nullIndex = connectTool.targets.indexOf(null);
  if (nullIndex === -1 || nullIndex === 8 || elIndex === 8) {
    replaceTarget(7);
    replaceTarget(8);
    nullIndex = 7;
  } else if (nullIndex === 5 || elIndex === 5) {
    replaceTarget(4);
    replaceTarget(5);
    nullIndex = 4;
  }
  return nullIndex;
}

function updateDecoderSources(): void {
  const rows: (string[] | null)[] = [
    connectTool.vectors[0]?.length
      ? fillCoordMapWithCoords(connectTool.targets[0]!, connectTool.vectors[0], connectTool.vectors[0].length)
      : null,
    connectTool.vectors[1]?.length
      ? fillCoordMapWithCoords(connectTool.targets[3]!, connectTool.vectors[1], connectTool.vectors[1].length)
      : null,
    connectTool.vectors[2]?.length
      ? fillCoordMapWithCoords(connectTool.targets[6]!, connectTool.vectors[2], connectTool.vectors[2].length)
      : null
  ];
  fillCoordMapWithElements(circuit, connectTool.coordMap);

  const check = (i: number, v: LogicElement) => {
    return (i < 2 && isOutputElement(v)) ||
      (i === 2 && isInputElement(v));
  };
  fillCTSources(rows, check);
}

// ==================== Общие вспомогательные методы ====================

/**
* Разрешает индекс элемента. Если targetIndex = -1, ищет в массиве targets.
*/
function resolveTargetIndex(el: ConnectToolTarget, targetIndex: number | undefined): number {
  if (targetIndex !== undefined && targetIndex !== -1) {
    if (targetIndex >= 0 && targetIndex < connectTool.targets.length)
      return targetIndex;
    else throw "targetIndex out of range in resolveTargetIndex"
  }
  return connectTool.targets.indexOf(el);
}

/**
* Устанавливает элемент в targets и добавляет overlay
*/
function setTargetWithOverlay(index: number, el: ConnectToolTarget): ConnectToolTarget {
  if (index === -1) return el;
  const oldTarget = connectTool.targets[index];
  connectTool.targets[index] = el;
  setOverlay(index, el);
  return oldTarget;
}

function setOverlay(index: number, el: ConnectToolTarget) {
  if (el instanceof LogicElement) {
    const iconIndex = index;
    const color = 7 + Math.trunc(index / 3);
    customOverlays.set(el, { icon: OverlayIconNames[iconIndex], color });
  }
}
/**
* Удаляет элемент по индексу и сбрасывает связанные векторы
*/
function removeTargetAtIndex(index: number, vectorIndicesToReset: number[]): ConnectToolTarget {
  const el = connectTool.targets[index];
  if (el instanceof LogicElement) {
    customOverlays.delete(el);
  }
  connectTool.targets[index] = null;

  vectorIndicesToReset.forEach(vi => {
    connectTool.vectors[vi] = { x: 0, y: 0, length: 0 };
  });

  // Очистка зависимых конечных элементов
  if (index < 3) {
    replaceTarget(5);
    replaceTarget(8);
  } else if (index < 5) {
    replaceTarget(5);
  } else if (index < 8) {
    replaceTarget(8);
  }
  return el;
}

/**
* Очищает overlay и устанавливает null для target
*/
function replaceTarget(index: number, target?: ConnectToolTarget): void {
  if (index >= 0 && index < connectTool.targets.length) {
    const el = connectTool.targets[index];
    if (el instanceof LogicElement) {
      customOverlays.delete(el);
    }
    connectTool.targets[index] = target ?? null;
    if (target) setOverlay(index, target);
    else removeTarget(index)
  }
}
function removeTarget(index: number) {
  switch (connectTool.mode) {
    case ConnectMode.NtoN: return null;
    case ConnectMode.Sequence: return removeTargetAtIndex(index, [0]);
    case ConnectMode.Parallel: return removeTargetAtIndex(index, index < 3 ? [0, 1] : [1]);
    case ConnectMode.Decoder: return removeTargetAtIndex(index, index < 3 ? [0, 1, 2] : index < 5 ? [1, 2] : [2]);
  }
}

export function replaceTargetAndProcess(index: number, target?: ConnectToolTarget) {
  replaceTarget(index, target);
  processConnectToolMode();
}

/**
* Авто-поиск конечного элемента по вектору
*/
function autoFindEndElement(
  startIdx: number,
  stepIdx: number,
  endIdx: number,
  icon: string,
  color: number,
  overrideLength?: number
): void {
  const start = connectTool.targets[startIdx];
  const step = connectTool.targets[stepIdx];
  if (!start || !step) return;

  const vector = overrideLength === undefined
    ? getVectorFrom3Points(start, step, connectTool.targets[endIdx]!)
    : getVectorFrom2Points(start, step, overrideLength);

  connectTool.vectors[startIdx === 0 ? 0 : startIdx === 3 ? 1 : 2] = vector;

  if (vector.length !== 0) {
    const pointN = {
      x: start.x + vector.x * vector.length,
      y: start.y + vector.y * vector.length,
    };

    let targetEl: ConnectToolTarget = getElementAt(circuit, camera, pointN, false);
    if (!targetEl) {
      targetEl = makeGhostEl(pointN);
    }

    const oldEnd = connectTool.targets[endIdx];
    if (targetEl === start || targetEl === step) {
      targetEl = null;
    }
    if (overrideLength === undefined) return;
    // Очистка старого overlay
    if (oldEnd instanceof LogicElement && oldEnd !== targetEl) {
      customOverlays.delete(oldEnd);
    }

    if (targetEl instanceof LogicElement) {
      customOverlays.set(targetEl, { icon, color });
    }
    if (targetEl !== null)
      connectTool.targets[endIdx] = targetEl;

  }
}

/**
* Очищает состояние режима (выделение, ghost-элементы)
*/
export function clearModeState(): void {
  for (const s of connectTool.sources) s.clear();
  connectTool.coordMap.clear();

}

export function clearConnectTool(): void {
  clearModeState();
  ghostElements.clear();
  customOverlays.clear();
  connectTool.targets.fill(null);
  connectTool.vectors.forEach(v => { v.x = 0; v.y = 0; v.length = 0; });
}