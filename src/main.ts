// main.js
import { CircuitIO } from './circuitIO';
import { colors, CopyWiresMode, gateTypeToMode, gridSize, knownShapeIds, pathMap, shapeIdToType, ShowWiresMode, ToolMode, typeToshapeId, type Camera, type Point, type vec4 } from './consts';
import { draw, initContext } from './drawingWGL';
import { FileIO } from './fileIO';
import { I18n } from './i18n';
import { ruLocale, enLocale } from './locales';
import * as LogicGates from './logic';
import { LogicalExpressionParser } from './parser';
import { setupEvent, screenToWorld, getElementAt, getSelectionWorldRect, getElementsInRect, clamp } from './utils';


export const canvas = document.getElementById('circuit-canvas') as HTMLCanvasElement
export const camera: Camera = { x: 0, y: 0, zoom: 1 };
export const circuit = new LogicGates.Circuit();
export let elementUnderCursor: LogicGates.LogicElement | null;
let isSimulating = false;
let simInterval: number;
let prevMouseWorld: Point = { x: 0, y: 0 };
let prevMousePos: Point = { x: 0, y: 0 };

let mouseX = 0;
let mouseY = 0;
let isHandMoving = false;
export let isSelecting = false;
let isDragging = false;
export let selectionStart: Point = { x: 0, y: 0 };
export let selectionEnd: Point = { x: 0, y: 0 };
export let selectionColor: vec4;
export let selectedElements = new Set<LogicGates.LogicElement>();
export let selectedSources = new Set<LogicGates.LogicElement>();
export let selectedTargets = new Set<LogicGates.LogicElement>();
let selectionSet: Set<LogicGates.LogicElement>;

export let selectedTool: ToolMode = ToolMode.Cursor; // 'move' или 'connect'
let copyWiresMode: CopyWiresMode = CopyWiresMode.Inner; // режим по умолчанию
export let showWiresMode: ShowWiresMode = ShowWiresMode.Connect; // режим по умолчанию


let fileIO: FileIO;
let circuitIO: CircuitIO;
let logEqParser: LogicalExpressionParser;

const locales = {
  ru: ruLocale,
  en: enLocale,
}
type LocaleNames = keyof typeof locales
const i18n = new I18n(locales, 'ru')

const toggleLocale = () => {
  const localesToggleMap = {
    'ru': 'en',
    'en': 'ru',
  } satisfies Record<LocaleNames, LocaleNames>

  i18n.setLocale(localesToggleMap[i18n.localeName] as typeof i18n['localeName'])
}

window.onload = (() => {
  // Инициализация
  setupEvent('settings-toggle', "click", () => document.getElementById('settings-menu')?.classList.toggle('hidden'));
  setupEvent('theme-toggle', "click", () => toggleTheme());
  setupEvent('locale-toggle', "click", () => toggleLocale());
  setupEvent('user-manual-toggle', "click", () => document.getElementById('fm-user-manual')?.classList.toggle('hidden'));
  const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  toggleTheme(prefersDarkScheme.matches);
  updateToolButtons(document.querySelector("#tool-move") as HTMLElement);
  initContext();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colorPicker = document.querySelector("#tool-color-picker") as HTMLInputElement;
  circuitIO = new CircuitIO(circuit, colorPicker, camera, canvas);
  fileIO = new FileIO(circuitIO, document.getElementById("filename-display") as HTMLSpanElement);
  logEqParser = new LogicalExpressionParser();
  // Привязка кнопок
  setupEvent('save-scheme', 'click', fileIO.save);
  setupEvent('load-scheme', 'click', () => fileIO.load(false));
  setupEvent('add-scheme', 'click', () => fileIO.load(true));
  setupEvent('copy-wires-mode-btn', 'click', cycleCopyWiresMode);
  setupEvent('show-wires-mode-btn', 'click', cycleShowWiresMode);

  // Toolbar buttons
  ['and', 'or', 'xor', 'nand', 'nor', 'xnor', 't_flop', 'timer', 'button', 'switch', 'output'].forEach(id => {
    const el = document.getElementById('add-' + id);
    if (el) {
      el.onclick = () => {
        let type = id.toUpperCase();
        circuitIO.addElement(type, {});
        requestAnimationFrame(draw);
      };
    }


  });
  const switchTool = (e: Event, toolMode: ToolMode) => {
    selectedTool = toolMode;
    clearSelection();
    updateToolButtons(e.target as HTMLElement);
    requestAnimationFrame(draw);
  }
  setupEvent('tool-move', 'click', (e) => switchTool(e, ToolMode.Cursor));
  setupEvent('tool-connect', 'click', (e) => switchTool(e, ToolMode.Connect));
  setupEvent('tool-paint', 'click', (e) => switchTool(e, ToolMode.Paint));

  setupEvent('clear-canvas', 'click', clearCanvas);

  setupEvent('start-sim', 'click', () => {
    if (!isSimulating) {
      isSimulating = true;
      const clock = (document.getElementById('speed-sim') as HTMLInputElement);
      const value = parseInt(clock.innerHTML || clock.value || "40");
      simInterval = setInterval(optimizedStep, 1000 / value);
    }
  });

  setupEvent('step-sim', 'click', () => {
    isSimulating = false;
    clearInterval(simInterval);
    optimizedStep();
  });

  setupEvent('stop-sim', 'click', () => {
    isSimulating = false;
    clearInterval(simInterval);
  });
  setupEvent('speed-sim', 'change', () => {
    if (isSimulating) {

      isSimulating = false;
      clearInterval(simInterval);
      isSimulating = true;
      const clock = (document.getElementById('speed-sim') as HTMLInputElement);
      const min = parseInt(clock.getAttribute('min') || "1");
      const max = parseInt(clock.getAttribute('max') || "1000");
      const value = Math.max(min, Math.min(parseInt(clock.innerHTML || clock.value || "40"), max));
      clock.value = value.toString();
      simInterval = setInterval(optimizedStep, 1000 / value);
    }
  });

  const floatingMenus = document.querySelectorAll(".floating-menu") as NodeListOf<HTMLElement>;
  let mouse = { x: 0, y: 0 };
  for (const floatingMenu of floatingMenus) {
    const header = floatingMenu.querySelector(".floating-menu-header") as HTMLElement;
    header?.addEventListener('mousedown', (e) => {
      // floatingMenu.toggleAttribute("dragging", true);
      e.preventDefault();
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      const onMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        if (20 > e.clientX || e.clientX > window.innerWidth - 20 ||
          20 > e.clientY || e.clientY > window.innerHeight - 20) {
          onMouseUp();
        }
        const x = clamp(floatingMenu.offsetLeft - (mouse.x - e.clientX) / window.devicePixelRatio, 20, window.innerWidth - parseInt(getStyleFMH.width) - 55);
        const y = clamp(floatingMenu.offsetTop - (mouse.y - e.clientY) / window.devicePixelRatio, 20, window.innerHeight - parseInt(getStyleFMH.height) - 55);
        floatingMenu.style.left = `${x}px`;
        floatingMenu.style.top = `${y}px`;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
      const onMouseUp = () => {
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('mousemove', onMouseMove);
      };
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mousemove', onMouseMove);
    });
    const getStyleFM = window.getComputedStyle(floatingMenu);
    const getStyleFMH = window.getComputedStyle(header);
    const x = parseInt(getStyleFM.left);
    const y = parseInt(getStyleFM.top);
    floatingMenu.style.left = `${x}px`;
    floatingMenu.style.top = `${y}px`;
    floatingMenu.style.width = getStyleFM.width;
    const check = header.querySelector("input[type='checkbox']") as HTMLInputElement;
    const hideBtn = header.querySelector("button.hide") as HTMLButtonElement;
    const container = floatingMenu.querySelector(".floating-menu-container");
    check?.addEventListener("change", () => {
      container?.classList.toggle("hidden", check.checked);
    })
    hideBtn?.addEventListener("click", () => {
      floatingMenu.classList.toggle("hidden", true);
    })
  }
  const fmLogEq = document.getElementById("fm-logeq");
  const logEqText = document.getElementById("logeq-text") as HTMLTextAreaElement;
  const logEqFlatten = document.getElementById("logeq-flatten") as HTMLInputElement;
  const logEqInputEl = document.getElementById("logeq-input-el") as HTMLSelectElement;
  setupEvent("toggle-logeq-editor", 'click', () => {
    fmLogEq?.classList.toggle("hidden", false);
  });
  setupEvent("logeq-clear", 'click', () => {
    logEqText.value = '';
  });
  setupEvent("logeq-parse", 'click', () => {
    if (logEqText.value) {
      try {
        const newEls = circuitIO.fromLayers(logEqParser.parse(logEqFlatten.checked, logEqText.value), logEqInputEl.value);
        selectedElements.clear();
        for (const newEl of newEls) {
          selectedElements.add(newEl);
        }
        requestAnimationFrame(draw);
      }
      catch (err) {
        console.log(err);
      }
    }

  });

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

function toggleTheme(force?: boolean) {
  const htmlElement = document.documentElement;
  const toggleThemeBtnIcon = document.querySelector("#theme-toggle svg");
  let isDark: boolean;
  if (force !== undefined) {
    if (force) {
      htmlElement.setAttribute('data-theme', 'dark');
    } else {
      htmlElement.removeAttribute('data-theme');
    }
    isDark = force;
  } else {
    if (htmlElement.getAttribute('data-theme') === 'dark') {
      htmlElement.removeAttribute('data-theme');
      isDark = false;
    } else {
      htmlElement.setAttribute('data-theme', 'dark');
      isDark = true;
    }
  }
  if (toggleThemeBtnIcon)
    toggleThemeBtnIcon.innerHTML = `<path d="${(isDark ? pathMap.get('moon') : pathMap.get('sun'))}"/>`;
  if (isDark) {
    colors.grid = [0, 0, 0, 1];
    colors.background = [0.1, 0.1, 0.1, 1];
  } else {
    colors.grid = [0.8, 0.8, 0.8, 1];
    colors.background = [0.9, 0.9, 0.9, 1];
  }
  requestAnimationFrame(draw);
}

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
}

function disconnectSelected() {
  if (selectedSources.size === 0 || selectedTargets.size === 0) return;

  for (const source of selectedSources) {
    for (const target of selectedTargets) {
      circuit.removeWire(source, target);
    }
  }

  clearSelection();
}

function updateCopyWiresButtonText() {
  const btn = document.getElementById("copy-wires-mode-btn")!;
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
  switch (showWiresMode) {
    case ShowWiresMode.None:
      btn.textContent = "Show wires: None";
      break;
    case ShowWiresMode.Connect:
      btn.textContent = "Show wires: Connect";
      break;
    case ShowWiresMode.Temporary:
      btn.textContent = "Show wires: Temp";
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



canvas.addEventListener('mousedown', e => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  const el = getElementAt(circuit, camera, mouseX, mouseY);
  if (el) {
    if (e.button === 1) {
      if (elementUnderCursor === el)
        elementUnderCursor = null;
      else
        elementUnderCursor = el;
    } else if (selectedTool === ToolMode.Connect) {
      if (e.button === 0) {
        if (!LogicGates.isOutputElement(el)) {
          if (!selectedSources.has(el)) {
            selectedSources.add(el);
          } else {
            selectedSources.delete(el);
          }
        }
      } else if (e.button === 2) {
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
          const delay = prompt(`Set delay (now ${el.delay} ticks):`)?.trim();
          const newDelay = Math.round(Number(delay));
          if (delay !== null && delay !== '' && !Number.isNaN(newDelay) && (0 <= newDelay && newDelay <= 1024)) {
            el.setDelay(newDelay);
            for (const elI of selectedElements) {
              if (elI instanceof LogicGates.Timer)
                elI.setDelay(newDelay);
            }
          }
        } else if (el instanceof LogicGates.LogicGate) {
          const mode = prompt(`Set gate mode (now ${el.gateType}):`)?.trim();
          const newMode = Math.round(Number(mode));
          if (mode !== null && mode !== '' && !Number.isNaN(newMode) && (0 <= newMode && newMode <= 6)) {
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
    isSelecting = true;
    selectionStart = { x: e.offsetX, y: e.offsetY };
    selectionEnd = { x: e.offsetX, y: e.offsetY };
    if (selectedTool === ToolMode.Cursor && e.button === 0) {
      selectionColor = colors.selection;
      selectionSet = selectedElements;
    }
    else if (selectedTool === ToolMode.Connect && e.button === 0) {
      selectionColor = colors.source;
      selectionSet = selectedSources;
    }
    else if (selectedTool === ToolMode.Connect && e.button === 2) {
      selectionColor = colors.target;
      selectionSet = selectedTargets;
    }
    else if (selectedTool === ToolMode.Paint && e.button === 0) {
      selectionColor = colors.paint;
      selectionSet = selectedElements;
    } else {
      isSelecting = false;
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
      getElementsInRect(circuit, rect).forEach(el => selectionSet.delete(el));
    else if (e.shiftKey)
      getElementsInRect(circuit, rect).forEach(el => selectionSet.add(el));
    else {
      selectionSet.clear();
      getElementsInRect(circuit, rect).forEach(el => selectionSet.add(el));

    }
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

function zoomCanvas(isZoomIn: boolean, centerX: number, centerY: number) {
  const zoomFactor = 1.1;
  const scale = isZoomIn ? zoomFactor : 1 / zoomFactor;
  const h1 = camera.zoom * gridSize;
  const worldX = (camera.x + centerX) / h1;
  const worldY = (camera.y + centerY) / h1;

  camera.zoom = clamp(camera.zoom * scale, 0.35, 25);
  const h2 = camera.zoom * gridSize;
  camera.x = worldX * h2 - centerX;
  camera.y = worldY * h2 - centerY;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomCanvas(e.deltaY < 0, e.offsetX, e.offsetY);
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
  if (document.activeElement === document.body) {
    if (e.key === 'Delete' && selectedElements.size > 0) {
      // Удаление выбранных элементов
      for (const element of selectedElements) {
        circuit.removeWiresForElement(element);
      }
      if (elementUnderCursor && selectedElements.has(elementUnderCursor))
        elementUnderCursor = null;
      selectedElements.forEach(el => circuit.elements.delete(el));
      clearSelection();
    } else if (e.key === '-' || e.key === '+') {
      zoomCanvas(e.key === '+', canvas.width / 2, canvas.height / 2);
    } else if (e.key === 'Escape') {
      clearSelection();
    } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.key === 'c') {
      document.getElementById('tool-connect')?.click();
    } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.key === 'v') {
      document.getElementById('tool-move')?.click();
    } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.key === 'p') {
      document.getElementById('tool-paint')?.click();
    } else if (e.altKey && e.key.toLowerCase() === "w") {
      cycleCopyWiresMode();
    } else if (e.shiftKey && e.key.toLowerCase() === "w") {
      cycleShowWiresMode();
    } else if (e.key.toLowerCase() === "r") {
      circuitIO.rotateSelected(selectedElements, e.shiftKey);
    } else if (e.key.toLowerCase() === "f") {
      circuitIO.flipSelected(selectedElements, e.shiftKey);
    } else if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow')) {
      const mul = (e.shiftKey ? 5 : 1) * gridSize;
      if (e.key === 'ArrowRight') {
        camera.x += mul;
      } else if (e.key === 'ArrowLeft') {
        camera.x -= mul;
      } else if (e.key === 'ArrowUp') {
        camera.y -= mul;
      } else if (e.key === 'ArrowDown') {
        camera.y += mul;
      }
    } else if (e.key.startsWith('Arrow') && selectedElements.size > 0) {
      const deltaWorld = { x: 0, y: 0 };
      const mul = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowRight') {
        deltaWorld.x = mul;
      } else if (e.key === 'ArrowLeft') {
        deltaWorld.x = -mul;
      } else if (e.key === 'ArrowUp') {
        deltaWorld.y = -mul;
      } else if (e.key === 'ArrowDown') {
        deltaWorld.y = mul;
      }
      for (const el of selectedElements) {
        el.x += deltaWorld.x;
        el.y += deltaWorld.y;
      }
    } else if (selectedTool === ToolMode.Cursor) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();

        navigator.clipboard.writeText(circuitIO.serializeSelectedElements(selectedElements)).catch((err) => { console.log(err) });
      } else if (e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const cursorX = prevMousePos.x;
        const cursorY = prevMousePos.y;
        circuitIO.pasteSelectedElementsAtCursor(copyWiresMode, selectedElements, cursorX, cursorY);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const cursorX = prevMousePos.x;
        const cursorY = prevMousePos.y;
        navigator.clipboard.readText().then((json) => {
          try {
            const newElements = circuitIO.deserializeJSONAtPoint(copyWiresMode, json, screenToWorld(camera, cursorX, cursorY));
            selectedElements.clear();
            newElements.forEach(el => selectedElements.add(el));
          } catch (err) {
            console.log(err);
          }
        }).catch(err => console.log(err));
      }
    } else if (selectedTool === ToolMode.Connect) {
      if (e.key === 'Enter' && (selectedSources.size > 0 && selectedTargets.size > 0)) {
        connectSelected();
      }
      else if (e.key === 'Backspace') {
        disconnectSelected();
      } 
    } else if (selectedTool === ToolMode.Paint) {
      if (e.key === 'Enter')
        circuitIO.paintSelected(selectedElements, null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const cursorX = prevMousePos.x;
        const cursorY = prevMousePos.y;
        const el = getElementAt(circuit, camera, cursorX, cursorY);
        if (el) {
          navigator.clipboard.writeText(el.color).catch((err) => { console.log(err) });
        }
      }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        navigator.clipboard.readText().then((color) => {
          color = color.trim().replace('#', '');
          if (color.match('[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3}')) {
            if (color.length === 3) {
              color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2]; 
            }
            circuitIO.paintSelected(selectedElements, color);
            requestAnimationFrame(draw);
          }
        })
      }
    }
    requestAnimationFrame(draw);
  }


});

// Обновление кнопок инструментов
function updateToolButtons(pressedBtn?: HTMLElement) {
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.removeAttribute('active');
  });
  pressedBtn?.setAttribute('active', 'true');
}

window.addEventListener("beforeunload", (e) => {
  // e.preventDefault();
});
