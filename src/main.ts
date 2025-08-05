// main.js
import { draw, initContext } from './drawingWGL';
import * as LogicGates from './logic';
export type Point = { x: number, y: number };

export const gridSize = 20;
export const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement
export const camera = { x: 0, y: 0, zoom: 1 };
export const circuit = new LogicGates.Circuit();
export let selectedTool = 'move'; // 'move' или 'connect'
export let elementUnderCursor: LogicGates.LogicElement;
let isSimulating = false;
let simInterval: NodeJS.Timeout;
let prevMouseWorld: Point = { x: 0, y: 0 };
let prevMousePos: Point = { x: 0, y: 0 };
export let selectedSources = new Array<LogicGates.LogicElement>();
export let selectedTargets = new Array<LogicGates.LogicElement>();
let mouseX = 0;
let mouseY = 0;
let isHandMoving = false;
export let isSelecting = false;
let isDragging = false;
export let selectionStart: Point = { x: 0, y: 0 };
export let selectionEnd: Point = { x: 0, y: 0 };
export let selectedElements = new Set<LogicGates.LogicElement>();

// === Вспомогательные ===

function setupEvent(id: string, event: string, handler: (e: Event) => void) {
  const element = document.getElementById(id);
  if (element) {
    (element as any)[event] = handler;
  } else {
    console.warn(`Element with id "${id}" not found`);
  }
}

function screenToWorld(sx: number, sy: number) {
  const h = camera.zoom * gridSize;
  return {
    x: (camera.x * camera.zoom + sx) / h,
    y: (camera.y * camera.zoom + sy) / h
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
    x: wx * h - camera.x * camera.zoom,
    y: wy * h - camera.y * camera.zoom
  };
}

window.onload = (() => {
  // Инициализация
  updateToolButtons();
  initContext();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - (document.querySelector('header')?.offsetHeight || 0);
  draw();
});

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - (document.querySelector('header')?.offsetHeight || 0);
  draw();
});
// Оптимизация симуляции
function optimizedStep() {
  circuit.step();
  requestAnimationFrame(draw);
}


function addElement(type: string, x: number | null, y: number | null) {
  let el;
  // Переводим координаты центра экрана в мировые координаты через screenToWorld
  const center = screenToWorld(canvas.width / 2, canvas.height / 2);
  const worldX = x || Math.round(center.x + Math.random() * 10 - 5);
  const worldY = y || Math.round(center.y + Math.random() * 10 - 5);

  switch (type) {
    case 'AND':
    case 'OR':
    case 'XOR':
    case 'NAND':
    case 'NOR':
    case 'XNOR':
      el = new LogicGates.LogicGate(type, worldX, worldY);
      break;
    case 'T_FLOP':
      el = new LogicGates.TFlop(worldX, worldY);
      break;
    case 'TIMER':
      el = new LogicGates.Timer(worldX, worldY);
      break;
    case 'BUTTON':
      el = new LogicGates.Button(worldX, worldY);
      break;
    case 'SWITCH':
      el = new LogicGates.Switch(worldX, worldY);
      break;
    case 'OUTPUT':
      el = new LogicGates.OutputElement(worldX, worldY);
      break;
    default:
      return null;
  }
  return circuit.addElement(el);
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
    circuit.elements = [];
    circuit.wires.clear();
    clearSelection();
    draw();
  }
}

function clearSelection() {
  selectedSources = [];
  selectedTargets = [];
  selectedElements.clear();
}

function connectSelected() {
  if (selectedSources.length === 0 || selectedTargets.length === 0) return;

  // Создаем новые связи
  for (const source of selectedSources) {
    for (const target of selectedTargets) {
      if (source !== target && (!LogicGates.isOutputElement(source)) && (!LogicGates.isInputElement(target))) {
        circuit.addWire(source, target);
      }
    }
  }

  clearSelection();
  draw();
}

function disconnectSelected() {
  if (selectedSources.length === 0 || selectedTargets.length === 0) return;

  for (const source of selectedSources) {
    for (const target of selectedTargets) {
      circuit.removeWire(source, target);
    }
  }

  clearSelection();
  draw();
}


canvas.addEventListener('mousedown', e => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  const el = getElementAt(mouseX, mouseY);
  if (el) {
    if (selectedTool === 'connect') {
      if (e.button === 0) {
        if (!LogicGates.isOutputElement(el)) {
          const index = selectedSources.indexOf(el);
          if (index === -1) {
            selectedSources.push(el);
          } else {
            selectedSources.splice(index, 1);
          }
        }
      } else if (e.button === 1) {
        elementUnderCursor = el;
      }
      else if (e.button === 2) {
        if (!LogicGates.isInputElement(el)) {
          const index = selectedTargets.indexOf(el);
          if (index === -1) {
            selectedTargets.push(el);
          } else {
            selectedTargets.splice(index, 1);
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


  draw();
});

canvas.addEventListener('mousemove', e => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  let mouseWorld = screenToWorld(mouseX, mouseY);

  if (isHandMoving) {
    camera.x -= (e.offsetX - prevMousePos.x) / camera.zoom;
    camera.y -= (e.offsetY - prevMousePos.y) / camera.zoom;
    prevMousePos.x = e.offsetX;
    prevMousePos.y = e.offsetY;
    draw();
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
    draw();
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
    draw();
  }


});
window.addEventListener('mouseup', _ => {
  if (isSelecting || isDragging) {
    isSelecting = false;
    isDragging = false;
    draw();
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

  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  const worldX = camera.x + mouseX / camera.zoom;
  const worldY = camera.y + mouseY / camera.zoom;

  camera.zoom *= scale;

  camera.x = worldX - mouseX / camera.zoom;
  camera.y = worldY - mouseY / camera.zoom;

  draw();
}, { passive: false });

canvas.addEventListener('mouseup', e => {
  if (isHandMoving && e.button === 1) {
    isHandMoving = false;
  }
  else {
    if (isSelecting || isDragging) {
      isSelecting = false;
      isDragging = false;
      draw();
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
    circuit.elements = circuit.elements.filter(el => !selectedElements.has(el));
    clearSelection();
    draw();
  } else
    if (selectedTool === 'connect') {
      if (e.key === 'Enter' && (selectedSources.length > 0 && selectedTargets.length > 0)) {
        connectSelected();
      }
      else if (e.key === 'Backspace') {
        disconnectSelected();
      }
      else if (e.key === 'Escape') {
        clearSelection();
        draw();
      }
    }



});

// Обновление кнопок инструментов
function updateToolButtons() {
  document.querySelectorAll('#toolbar .tool-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`tool-${selectedTool}`)?.classList.add('active');
}

// Toolbar buttons
['add-and', 'add-or', 'add-xor', 'add-nand', 'add-nor', 'add-xnor', 'add-t_flop', 'add-timer', 'add-button', 'add-switch', 'add-output'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.onclick = () => {
      const type = id.replace('add-', '').toUpperCase();
      addElement(type, null, null);
      draw();
    };
  }


});

setupEvent('tool-move', 'onclick', (_) => {
  selectedTool = 'move';
  clearSelection();
  updateToolButtons();
  draw();
});

setupEvent('tool-connect', 'onclick', (_) => {
  selectedTool = 'connect';
  clearSelection();
  updateToolButtons();
  draw();
});

setupEvent('clear-canvas', 'onclick', clearCanvas);

setupEvent('start-sim', 'onclick', (_) => {
  if (!isSimulating) {
    isSimulating = true;
    simInterval = setInterval(optimizedStep, 25);
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

setupEvent('save-scheme', 'onclick', (_) => {
  const data = JSON.stringify(serializeCircuit());
  const blob = new Blob([data], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'circuit.json';
  a.click();
  URL.revokeObjectURL(url);
});

setupEvent('load-scheme', 'onclick', (_) => {
  document.getElementById('file-input')?.click();
});

setupEvent('file-input', 'onchange', (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const result = evt.target?.result;
    if (typeof result !== 'string') {
      console.error('Expected string result from FileReader');
      return;
    }

    try {
      const data = JSON.parse(result);
      deserializeCircuit(data);
      draw();
    } catch (error) {
      console.error('Error parsing JSON:', error);
    }
  };
  reader.readAsText(file);
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
});

// Оптимизированная сериализация
function serializeCircuit() {
  return {
    elements: circuit.elements.map(el => ({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
    })),
    wires: Array.from(circuit.wires.values()).map(w => ({
      from: w.from.id,
      to: w.to.id
    }))
  };
}

function deserializeCircuit(data: { elements: any; wires: any; }) {
  circuit.elements = [];
  circuit.wires.clear();
  const idMap = new Map<number, LogicGates.LogicElement>();
  for (const el of data.elements) {
    let obj = addElement(el.type, el.x, el.y);
    if (obj) {
      idMap.set(el.id, obj);
    }
  }
  for (const w of data.wires) {
    const from = idMap.get(w.from);
    const to = idMap.get(w.to);
    if (from && to) {
      circuit.addWire(from, to);
    }
  }
}

