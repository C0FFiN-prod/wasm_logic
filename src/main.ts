// main.js
import { CircuitIO } from './circuitIO';
import { CopyWiresMode, gateTypeToMode, gridSize, knownShapeIds, shapeIdToType, ShowWiresMode, ToolMode, typeToshapeId, type Camera, type Point } from './consts';
import { draw, initContext } from './drawingWGL';
import { FileIO } from './fileIO';
import * as LogicGates from './logic';
import { setupEvent, screenToWorld, getElementAt, getSelectionWorldRect, getElementsInRect } from './utils';


export const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement
export const camera: Camera = { x: 0, y: 0, zoom: 1 };
export const circuit = new LogicGates.Circuit();
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

export let selectedTool: ToolMode = ToolMode.Cursor; // 'move' или 'connect'
let copyWiresMode: CopyWiresMode = CopyWiresMode.Inner; // режим по умолчанию
export let showWiresMode: ShowWiresMode = ShowWiresMode.Connect; // режим по умолчанию


let fileIO: FileIO;
let circuitIO: CircuitIO;
window.onload = (() => {
  // Инициализация
  updateToolButtons();
  initContext();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - (document.querySelector('header')?.offsetHeight || 0);
  circuitIO = new CircuitIO(circuit, camera, canvas);
  fileIO = new FileIO(circuitIO, document.getElementById("filename-display") as HTMLSpanElement);

  // Привязка кнопок
  setupEvent('save-scheme', 'onclick', fileIO.save);
  setupEvent('load-scheme', 'onclick', fileIO.load);

  const floatingMenus = document.querySelectorAll(".floating-menu") as NodeListOf<HTMLElement>;
  for (const floatingMenu of floatingMenus) {
    const header = floatingMenu.querySelector(".floating-menu-header") as HTMLElement;
    header?.addEventListener('mousedown', (e) => {
      floatingMenu.toggleAttribute("dragging", true);
    });
    header?.addEventListener('mouseup', (e) => {
      floatingMenu.toggleAttribute("dragging", false);
    });
    header?.addEventListener('mouseout', (e) => {
      floatingMenu.toggleAttribute("dragging", false);
    });
    header?.addEventListener('mousemove', ({ movementX, movementY }) => {
      if (floatingMenu.hasAttribute("dragging")) {
        const getStyle = window.getComputedStyle(floatingMenu);
        const x = parseInt(getStyle.left) + movementX;
        const y = parseInt(getStyle.top) + movementY;
        floatingMenu.style.left = `${x}px`;
        floatingMenu.style.top = `${y}px`;
      }
    });
    const getStyle = window.getComputedStyle(floatingMenu);
    const x = parseInt(getStyle.left);
    const y = parseInt(getStyle.top);
    floatingMenu.style.left = `${x}px`;
    floatingMenu.style.top = `${y}px`;
  }

  // Ctrl+S обработчик
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      fileIO.save();
    }
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

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

function clearCanvas() {
  if (confirm('Вы уверены, что хотите очистить холст?')) {
    circuit.clear();
    fileIO.clearFileHandle();
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

  const el = getElementAt(circuit, camera, mouseX, mouseY);
  if (el) {
    if (selectedTool === ToolMode.Connect) {
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
        prevMouseWorld = screenToWorld(camera, mouseX, mouseY);
        isDragging = true;
      }
      else if (e.button === 2) {
        if (el === null) {

        } else if (el instanceof LogicGates.Switch) {
          el.setValue(!el.value);
        } else if (el instanceof LogicGates.Button) {
          el.setValue(true);
        } else if (el instanceof LogicGates.Timer) {
          let delay = prompt(`Set delay (now ${el.delay} ticks):`);
          let newDelay = Math.round(Number(delay));
          if (delay !== '' && !Number.isNaN(newDelay) && (0 <= newDelay && newDelay <= 1024)) {
            el.setDelay(newDelay);
            for (const elI of selectedElements) {
              if (elI instanceof LogicGates.Timer)
                elI.setDelay(newDelay);
            }
          }
        } else if (el instanceof LogicGates.LogicGate) {
          let mode = prompt(`Set gate mode (now ${el.gateType}):`);
          let newMode = Math.round(Number(mode));
          if (mode !== '' && !Number.isNaN(newMode) && (0 <= newMode && newMode <= 6)) {
            el.gateType = newMode;
            for (const elI of selectedElements) {
              if (elI instanceof LogicGates.LogicGate)
                elI.gateType = newMode;
            }
            requestAnimationFrame(draw);
          }
        }
      }
    }
  } else {
    if (selectedTool === ToolMode.Cursor && e.button === 0) {
      isSelecting = true;
      selectionStart = { x: e.offsetX, y: e.offsetY };
      selectionEnd = { x: e.offsetX, y: e.offsetY };
      if (!e.shiftKey) {
        clearSelection();
      }
    }
  }
  if (e.button === 1) {
    if (selectedTool === ToolMode.Connect && el) {
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

  let mouseWorld = screenToWorld(camera, mouseX, mouseY);

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
    const rect = getSelectionWorldRect(camera, selectionStart, selectionEnd);
    if (e.ctrlKey && e.shiftKey)
      getElementsInRect(circuit, rect).forEach(el => selectedElements.delete(el));
    else if (e.shiftKey)
      getElementsInRect(circuit, rect).forEach(el => selectedElements.add(el));
    else
      selectedElements = getElementsInRect(circuit, rect);
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
  } else if (selectedTool === ToolMode.Connect) {
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

    circuitIO.pasteSelectedElementsAtCursor(copyWiresMode, selectedElements, cursorX, cursorY);
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
      circuitIO.addElement(type, {});
      requestAnimationFrame(draw);
    };
  }


});

setupEvent('tool-move', 'onclick', (_) => {
  selectedTool = ToolMode.Cursor;
  clearSelection();
  updateToolButtons();
  requestAnimationFrame(draw);
});

setupEvent('tool-connect', 'onclick', (_) => {
  selectedTool = ToolMode.Connect;
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

window.addEventListener("beforeunload", (e) => {
  // e.preventDefault();
});
