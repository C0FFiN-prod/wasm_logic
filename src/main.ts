// main.js
import { gateTypeToMode, knownShapeIds, shapeIdToType, typeToshapeId } from './consts';
import { draw, initContext } from './drawingWGL';
import * as LogicGates from './logic';
export type Point = { x: number, y: number };

export const gridSize = 20;
export const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement
export const camera = { x: 0, y: 0, zoom: 1 };
export const circuit = new LogicGates.Circuit();
export let selectedTool = 'move'; // 'move' или 'connect'
export let elementUnderCursor: LogicGates.LogicElement | null;
let isSimulating = false;
let simInterval: NodeJS.Timeout;
let prevMouseWorld: Point = { x: 0, y: 0 };
let prevMousePos: Point = { x: 0, y: 0 };
export let selectedSources = new Set<LogicGates.LogicElement>();
export let selectedTargets = new Set<LogicGates.LogicElement>();
let mouseX = 0;
let mouseY = 0;
let isHandMoving = false;
export let isSelecting = false;
let isDragging = false;
export let selectionStart: Point = { x: 0, y: 0 };
export let selectionEnd: Point = { x: 0, y: 0 };
export let selectedElements = new Set<LogicGates.LogicElement>();
const CopyWiresMode = {
  None: 0,
  Inner: 1,
  All: 2
} as const;
type CopyWiresMode = typeof CopyWiresMode[keyof typeof CopyWiresMode];
let copyWiresMode: CopyWiresMode = CopyWiresMode.Inner; // режим по умолчанию
export const ShowWiresMode = {
  None: 0,
  Connect: 1,
  Temporary: 2,
  Always: 3
} as const;
export type ShowWiresMode = typeof ShowWiresMode[keyof typeof ShowWiresMode];
export let showWiresMode: ShowWiresMode = ShowWiresMode.Connect; // режим по умолчанию

// === Вспомогательные ===

function setupEvent(id: string, event: string, handler: (e: Event) => void) {
  const element = document.getElementById(id);
  if (element) {
    (element as any)[event] = handler;
  } else {
    console.warn(`Element with id "${id}" not found`);
  }
}

export function screenToWorld(sx: number, sy: number) {
  const h = camera.zoom * gridSize;
  return {
    x: (camera.x + sx) / h,
    y: (camera.y + sy) / h
  };
}

export function worldToTranslatedScreen(wx: number, wy: number): Point {
  return {
    x: wx * gridSize,
    y: wy * gridSize
  };
}

export function worldToScreen(wx: number, wy: number): Point {
  const h = camera.zoom * gridSize;
  return {
    x: (wx * h - camera.x),
    y: (wy * h - camera.y)
  };
}

window.onload = (() => {
  // Инициализация

  updateToolButtons();
  initContext();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - (document.querySelector('header')?.offsetHeight || 0);
  requestAnimationFrame(draw);
});

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - (document.querySelector('header')?.offsetHeight || 0);
  requestAnimationFrame(draw);
});
// Оптимизация симуляции
function optimizedStep() {
  circuit.step();
  requestAnimationFrame(draw);
}


function addElement(type: string, params: Record<string, any>) {
  const center = screenToWorld(canvas.width / 2, canvas.height / 2);
  params.pos = params.pos || {};
  params.controller = params.controller || {};
  params.pos.x = params.pos.x || Math.round(center.x + Math.random() * 10 - 5);
  params.pos.y = params.pos.y || Math.round(center.y + Math.random() * 10 - 5);
  params.pos.z = params.pos.z || 0;
  params.xaxis = params.xaxis || -2;
  params.zaxis = params.zaxis || -1;
  params.color = params.color || "222222";
  params.controller.luminance = params.controller.luminance || 50;

  let mode;
  if ((mode = gateTypeToMode.get(type)) !== undefined) {
    params.controller.mode = mode;
    type = 'GATE';
  }

  return circuit.addElement(type, params);
}

function pasteSelectedElementsAtCursor(
  selectedElements: Set<LogicGates.LogicElement>,
  cursorScreenX: number,
  cursorScreenY: number
) {
  if (selectedElements.size === 0) return;

  // 1. Находим минимальные X и Y среди выбранных
  let minX = Infinity;
  let minY = Infinity;
  for (const el of selectedElements) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
  }

  // 2. Получаем мировые координаты курсора и округляем вниз
  let { x: baseWorldX, y: baseWorldY } = screenToWorld(cursorScreenX, cursorScreenY);
  baseWorldX = Math.floor(baseWorldX);
  baseWorldY = Math.floor(baseWorldY);

  // 3. Копируем элементы с сохранением смещений
  const oldToNewMap = new Map<number, LogicGates.LogicElement>();

  for (const el of selectedElements) {
    const offsetX = el.x - minX;
    const offsetY = el.y - minY;

    const newEl = addElement(el.type, { pos: { x: baseWorldX + offsetX, y: baseWorldY + offsetY }, color: el.color, controller: el.getController() });
    if (newEl)
      oldToNewMap.set(el.id, newEl);
  }

  // 4. Восстанавливаем соединения в зависимости от режима
  if (copyWiresMode !== CopyWiresMode.None) {
    for (const oldEl of selectedElements) {
      const newEl = oldToNewMap.get(oldEl.id)!;

      for (const inputEl of oldEl.inputs) {
        if (copyWiresMode === CopyWiresMode.Inner) {
          // Только внутренние связи
          if (selectedElements.has(inputEl)) {
            const newInputEl = oldToNewMap.get(inputEl.id)!;
            circuit.addWire(newInputEl, newEl);
          }
        } else if (copyWiresMode === CopyWiresMode.All) {
          // Внутренние + внешние
          if (selectedElements.has(inputEl)) {
            const newInputEl = oldToNewMap.get(inputEl.id)!;
            circuit.addWire(newInputEl, newEl);
          } else {
            circuit.addWire(inputEl, newEl);
          }
        }
      }
    }
  }
}




// === Выбор ===

function getSelectionWorldRect() {
  const p1 = screenToWorld(selectionStart.x, selectionStart.y);
  const p2 = screenToWorld(selectionEnd.x, selectionEnd.y);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p1.x - p2.x),
    height: Math.abs(p1.y - p2.y)
  };
}

function getElementsInRect(rect: { x: number; y: number; width: number; height: number; }) {
  const selected = new Set<LogicGates.LogicElement>();
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

function getElementAt(screenX: number, screenY: number) {
  const { x: wx, y: wy } = screenToWorld(screenX, screenY);
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




function clearCanvas() {
  if (confirm('Вы уверены, что хотите очистить холст?')) {
    circuit.clear();
    currentFileHandle = null;
    currentFileName = "Без названия";
    updateFilenameDisplay();
    clearSelection();
    requestAnimationFrame(draw);
  }
}

function clearSelection() {
  selectedSources.clear();
  selectedTargets.clear();
  selectedElements.clear();
}

function connectSelected() {
  if (selectedSources.size === 0 || selectedTargets.size === 0) return;

  // Создаем новые связи
  for (const source of selectedSources) {
    for (const target of selectedTargets) {
      if ((!LogicGates.isOutputElement(source)) && (!LogicGates.isInputElement(target))) {
        circuit.addWire(source, target);
      }
    }
  }

  clearSelection();
  requestAnimationFrame(draw);
}

function disconnectSelected() {
  if (selectedSources.size === 0 || selectedTargets.size === 0) return;

  for (const source of selectedSources) {
    for (const target of selectedTargets) {
      circuit.removeWire(source, target);
    }
  }

  clearSelection();
  requestAnimationFrame(draw);
}

function updateCopyWiresButtonText() {
  const btn = document.getElementById("copy-wires-mode-btn")!;
  console.log(copyWiresMode);
  switch (copyWiresMode) {
    case CopyWiresMode.None:
      btn.textContent = "Copy wires: None";
      break;
    case CopyWiresMode.Inner:
      btn.textContent = "Copy wires: Inner";
      break;
    case CopyWiresMode.All:
      btn.textContent = "Copy wires: All";
      break;
  }
}
function updateShowWiresButtonText() {
  const btn = document.getElementById("show-wires-mode-btn")!;
  console.log(showWiresMode);
  switch (showWiresMode) {
    case ShowWiresMode.None:
      btn.textContent = "Show wires: None";
      break;
    case ShowWiresMode.Connect:
      btn.textContent = "Show wires: Connect";
      break;
    case ShowWiresMode.Temporary:
      btn.textContent = "Show wires: Temporary";
      break;
    case ShowWiresMode.Always:
      btn.textContent = "Show wires: Always";
      break;
  }
}

function cycleCopyWiresMode() {
  copyWiresMode = (copyWiresMode + 1) % 3;
  updateCopyWiresButtonText();
}

function cycleShowWiresMode() {
  showWiresMode = (showWiresMode + 1) % 4;
  updateShowWiresButtonText();
  requestAnimationFrame(draw);
}

setupEvent('copy-wires-mode-btn', 'onclick', cycleCopyWiresMode);
setupEvent('show-wires-mode-btn', 'onclick', cycleShowWiresMode);

canvas.addEventListener('mousedown', e => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  const el = getElementAt(mouseX, mouseY);
  if (el) {
    if (selectedTool === 'connect') {
      if (e.button === 0) {
        if (!LogicGates.isOutputElement(el)) {
          if (!selectedSources.has(el)) {
            selectedSources.add(el);
          } else {
            selectedSources.delete(el);
          }
        }
      } else if (e.button === 1) {
        elementUnderCursor = el;
      }
      else if (e.button === 2) {
        if (!LogicGates.isInputElement(el)) {
          if (!selectedTargets.has(el)) {
            selectedTargets.add(el);
          } else {
            selectedTargets.delete(el);
          }
        }
      }
    }
    else {
      if (e.button === 0) {
        if (!selectedElements.has(el)) {
          if (!e.shiftKey) {
            clearSelection();
          }
          selectedElements.add(el);
        } else if (e.shiftKey) {
          selectedElements.delete(el);
        }
        prevMousePos.x = mouseX;
        prevMousePos.y = mouseY;
        prevMouseWorld = screenToWorld(mouseX, mouseY);
        isDragging = true;
      }
      else if (e.button === 2) {
        if (el instanceof LogicGates.Switch) {
          el.setValue(!el.value);
        } else if (el instanceof LogicGates.Button) {
          el.setValue(true);
        } else if (el instanceof LogicGates.Timer) {
          let delay = prompt(`Set delay (now ${el.delay} ticks):`);
          if (delay !== '')
            el.setDelay(Number(delay));
        }
      }
    }
  } else {
    if (selectedTool === 'move' && e.button === 0) {
      isSelecting = true;
      selectionStart = { x: e.offsetX, y: e.offsetY };
      selectionEnd = { x: e.offsetX, y: e.offsetY };
      if (!e.shiftKey) {
        clearSelection();
      }
    }
  }
  if (e.button === 1) {
    if (selectedTool === 'connect' && el) {
      elementUnderCursor = el;
    } else {
      prevMousePos.x = mouseX;
      prevMousePos.y = mouseY;
      isHandMoving = true;
    }
  }


  requestAnimationFrame(draw);
});

canvas.addEventListener('mousemove', e => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  let mouseWorld = screenToWorld(mouseX, mouseY);

  if (isHandMoving) {
    camera.x -= (e.offsetX - prevMousePos.x);
    camera.y -= (e.offsetY - prevMousePos.y);

    requestAnimationFrame(draw);
  } else if (isDragging && selectedElements.size > 0) {
    const deltaWorld = {
      x: Math.round(mouseWorld.x) - Math.round(prevMouseWorld.x),
      y: Math.round(mouseWorld.y) - Math.round(prevMouseWorld.y)
    }
    for (const el of selectedElements) {
      el.x += deltaWorld.x;
      el.y += deltaWorld.y;
    }

    prevMouseWorld.x = mouseWorld.x;
    prevMouseWorld.y = mouseWorld.y;
    requestAnimationFrame(draw);
  }
  else if (isSelecting) {
    selectionEnd = { x: e.offsetX, y: e.offsetY };
    const rect = getSelectionWorldRect();
    if (e.ctrlKey && e.shiftKey)
      getElementsInRect(rect).forEach(el => selectedElements.delete(el));
    else if (e.shiftKey)
      getElementsInRect(rect).forEach(el => selectedElements.add(el));
    else
      selectedElements = getElementsInRect(rect);
    requestAnimationFrame(draw);
  }
  prevMousePos.x = e.offsetX;
  prevMousePos.y = e.offsetY;

});
window.addEventListener('mouseup', _ => {
  if (isSelecting || isDragging) {
    isSelecting = false;
    isDragging = false;
    requestAnimationFrame(draw);
  }
})
canvas.addEventListener('mouseout', _ => {
  isHandMoving = false;
  isSelecting = false;
  isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  const zoomFactor = 1.1;
  const scale = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
  const h1 = camera.zoom * gridSize;
  const worldX = (camera.x + e.offsetX) / h1;
  const worldY = (camera.y + e.offsetY) / h1;

  camera.zoom *= scale;
  const h2 = camera.zoom * gridSize;
  camera.x = worldX * h2 - e.offsetX;
  camera.y = worldY * h2 - e.offsetY;
  console.log(camera)
  requestAnimationFrame(draw);
}, { passive: false });

canvas.addEventListener('mouseup', e => {
  if (isHandMoving && e.button === 1) {
    isHandMoving = false;
  }
  else {
    if (isSelecting || isDragging) {
      isSelecting = false;
      isDragging = false;
      requestAnimationFrame(draw);
    }
    e.stopPropagation();
  }

});

// Обработка клавиш
document.addEventListener('keydown', e => {
  if (e.key === 'Delete' && selectedElements.size > 0) {
    // Удаление выбранных элементов
    for (const element of selectedElements) {
      circuit.removeWiresForElement(element);
    }
    if (elementUnderCursor && selectedElements.has(elementUnderCursor))
      elementUnderCursor = null;
    selectedElements.forEach(el => circuit.elements.delete(el));
    clearSelection();
    requestAnimationFrame(draw);
  } else if (selectedTool === 'connect') {
    if (e.key === 'Enter' && (selectedSources.size > 0 && selectedTargets.size > 0)) {
      connectSelected();
    }
    else if (e.key === 'Backspace') {
      disconnectSelected();
    }
    else if (e.key === 'Escape') {
      clearSelection();
      requestAnimationFrame(draw);
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
    // Игнорируем, если фокус на input/textarea
    const target = e.target as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }

    e.preventDefault();

    // Берём текущие координаты курсора
    const cursorX = prevMousePos.x; // сюда подставь переменную с координатами экрана X
    const cursorY = prevMousePos.y; // сюда подставь переменную с координатами экрана Y

    pasteSelectedElementsAtCursor(selectedElements, cursorX, cursorY);
    requestAnimationFrame(draw);
  }



});

// Обновление кнопок инструментов
function updateToolButtons() {
  document.querySelectorAll('#toolbar .tool-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`tool-${selectedTool}`)?.classList.add('active');
  updateCopyWiresButtonText();
}

// Toolbar buttons
['add-and', 'add-or', 'add-xor', 'add-nand', 'add-nor', 'add-xnor', 'add-t_flop', 'add-timer', 'add-button', 'add-switch', 'add-output'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.onclick = () => {
      let type = id.replace('add-', '').toUpperCase();
      addElement(type, {});
      requestAnimationFrame(draw);
    };
  }


});

setupEvent('tool-move', 'onclick', (_) => {
  selectedTool = 'move';
  clearSelection();
  updateToolButtons();
  requestAnimationFrame(draw);
});

setupEvent('tool-connect', 'onclick', (_) => {
  selectedTool = 'connect';
  clearSelection();
  updateToolButtons();
  requestAnimationFrame(draw);
});

setupEvent('clear-canvas', 'onclick', clearCanvas);

setupEvent('start-sim', 'onclick', (_) => {
  if (!isSimulating) {
    isSimulating = true;
    simInterval = setInterval(optimizedStep, 1000 / parseInt((document.getElementById('speed-sim') as HTMLInputElement).value));
  }
});

setupEvent('step-sim', 'onclick', (_) => {
  isSimulating = false;
  clearInterval(simInterval);
  optimizedStep();
});

setupEvent('stop-sim', 'onclick', (_) => {
  isSimulating = false;
  clearInterval(simInterval);
});
setupEvent('speed-sim', 'onchange', (e) => {
  if (isSimulating) {
    
    isSimulating = false;
    clearInterval(simInterval);
    isSimulating = true;
    simInterval = setInterval(optimizedStep, 1000 / parseFloat((e.target as HTMLInputElement).value));
  }
  (e.target as HTMLElement).innerHTML = (e.target as HTMLInputElement).value;
  console.log((e.target as HTMLInputElement).value)
});

// Привязка кнопок
setupEvent('save-scheme', 'onclick', save);
setupEvent('load-scheme', 'onclick', load);

// Ctrl+S обработчик
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
});

let currentFileHandle: FileSystemFileHandle | null = null;
let currentFileName = "Без названия";
// Проверка поддержки FSAPI
const hasFSAPI = "showSaveFilePicker" in window && "showOpenFilePicker" in window;

const filenameDisplay = document.getElementById("filename-display") as HTMLSpanElement;

window.addEventListener("beforeunload", (e) => {
  // e.preventDefault();
});

function updateFilenameDisplay() {
  filenameDisplay.textContent = currentFileName;
}

// Клик по имени — превращаем в input для редактирования
filenameDisplay.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "text";
  input.id = "filename-input";
  input.value = currentFileName;;
  input.style.width = Math.max(120, currentFileName.length * 8) + "px";

  filenameDisplay.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;

  const finishEdit = () => {
    if (finished) return;
    finished = true;
    currentFileName = input.value.trim() || "Без названия";
    input.replaceWith(filenameDisplay);
    updateFilenameDisplay();
  };

  input.addEventListener("blur", finishEdit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      finishEdit();
    } else if (e.key === "Escape") {
      finished = true;
      input.replaceWith(filenameDisplay);
    }
  });
});

// ======= Сохранение =======
async function saveAs() {
  if (hasFSAPI) {
    // --- FSAPI способ ---
    const options = {
      suggestedName: currentFileName.endsWith(".json")
        ? currentFileName
        : currentFileName + ".json",
      types: [
        {
          description: "Logic Simulator Scheme",
          accept: { "application/json": [".json"] }
        }
      ]
    };
    currentFileHandle = await (window as any).showSaveFilePicker(options);
    currentFileName = currentFileHandle?.name.replace(/\.json$/i, "") || currentFileName;
    updateFilenameDisplay();
    await writeToCurrentFile();
  } else {
    // --- Fallback через Blob ---
    const dataStr = serializeCircuit();
    const blob = new Blob([dataStr], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (currentFileName || "scheme") + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
}
async function save() {
  if (hasFSAPI) {
    if (!currentFileHandle) {
      await saveAs();
      return;
    }
    try {
      if (currentFileName + '.json' !== currentFileHandle.name)
        await (currentFileHandle as any).move(currentFileName + '.json');
      await writeToCurrentFile();
    } catch (error) {
      console.error("Error moving file:", error);
      await saveAs();
    }
    return;
  } else {
    // В старых браузерах всегда будет Save As
    await saveAs();
  }
}

async function writeToCurrentFile() {
  if (!currentFileHandle) {
    await saveAs();
    return;
  }
  const writable = await currentFileHandle.createWritable();
  await writable.write(serializeCircuit());
  await writable.close();
}

// ======= Загрузка =======
async function load() {
  if (hasFSAPI) {
    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [
        {
          description: "Logic Simulator Scheme",
          accept: { "application/json": [".json"] }
        }
      ]
    });
    currentFileHandle = fileHandle;
    currentFileName = fileHandle.name?.replace(/\.json$/i, "") || "Без названия";
    updateFilenameDisplay();

    const file = await fileHandle.getFile();
    const contents = await file.text();
    deserializeCircuit(contents);
  } else {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = (input.files as FileList)[0];
      if (!file) return;
      currentFileName = file.name.replace(/\.json$/i, "");
      updateFilenameDisplay();

      const text = await file.text();
      deserializeCircuit(text);
    };
    input.click();
  }
  requestAnimationFrame(draw);
}

// Сериализация схемы в JSON
function serializeCircuit(): string {
  const data = {
    bodies: [
      {
        childs: [...unuseBlueprintObjects, ...Array.from(circuit.elements).map(el => ({
          color: el.color,
          id: el.id,
          controller: el.getController(),
          pos: {
            x: el.x,
            y: el.y,
            z: el.z
          },
          shapeId: typeToshapeId.get(el.type),
          xaxis: el.xaxis,
          zaxis: el.zaxis
        }))],
      }
    ],
    version: 4
  };
  return JSON.stringify(data, null);
}
let unuseBlueprintObjects: Array<Object> = [];
function deserializeCircuit(json: string) {
  const data = JSON.parse(json);
  circuit.clear();
  const idMap = new Map<number, LogicGates.LogicElement>();
  const version = data.version;

  const center = screenToWorld(canvas.width / 2, canvas.height / 2);
  const blueprintRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  if (version === 3 || version === 4) {
    let type: string | undefined;
    for (const body of data.bodies) {
      for (const child of body.childs) {
        if ((type = shapeIdToType.get(child.shapeId))) {
          const obj = addElement(type, child);
          if (obj) {
            idMap.set(child.id, obj);
            blueprintRect.x0 = Math.min(obj.x, blueprintRect.x0);
            blueprintRect.y0 = Math.min(obj.y, blueprintRect.y0);
            blueprintRect.x1 = Math.max(obj.x, blueprintRect.x1);
            blueprintRect.y1 = Math.max(obj.y, blueprintRect.y1);
          }
        } else {
          unuseBlueprintObjects.push(child);
        }
      }
    }
    const blueprintCenter = {
      x: (blueprintRect.x1 + blueprintRect.x0) / 2,
      y: (blueprintRect.y1 + blueprintRect.y0) / 2
    }
    const blueprintDelta = {
      x: Math.round(center.x - blueprintCenter.x),
      y: Math.round(center.y - blueprintCenter.y),
    } 
    
    for (const body of data.bodies) {
      for (const child of body.childs) {
        if ((type = shapeIdToType.get(child.shapeId))) {
          const src = idMap.get(child.id)!;
          src.x += blueprintDelta.x;
          src.y += blueprintDelta.y;
          if (child.controller.controllers) {
            for (const controlled of child.controller.controllers) {
              const dst = idMap.get(controlled.id);
              if (src && dst) {
                circuit.addWire(src, dst);
                if (src instanceof LogicGates.LogicGate && src.gateType == 2 && src == dst) {
                  src.gateType = 6;
                }
              }
            }
          }
        }
      }
    }


  } else {
    for (const el of data.elements) {
      let type = gateTypeToMode.has(el.type) ? 'GATE' : el.type;
      const obj = addElement(type, type === 'GATE' ? { pos: { x: el.x, y: el.y }, controller: { mode: gateTypeToMode.get(el.type) } } : { pos: { x: el.x, y: el.y } });
      if (obj) {
        idMap.set(el.id, obj);
      }
    }

    if (!version) {
      for (const w of data.wires) {
        const src = idMap.get(w.from);
        const dst = idMap.get(w.to);
        if (src && dst) {
          circuit.addWire(src, dst);
        }
      }
    } else if (version === 1) {
      for (const w of data.wires) {
        const src = idMap.get(w.src);
        const dst = idMap.get(w.dst);
        if (src && dst) {
          circuit.addWire(src, dst);
        }
      }
    }
  }

}
