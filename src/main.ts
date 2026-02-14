// main.js
import { CircuitIO } from './IOs/circuitIO';
import { colors, ConnectMode, CopyWiresMode, Drawings, gateTypeToMode, gridSize, locales, maxZoom, ShowWiresMode, Themes, ToolMode, WireDrawings, type Camera, type ElementPDO, type LocaleNames, type Point, type vec4 } from './consts';
import { FileIO } from './IOs/fileIO';
import { I18n } from './utils/i18n';
import * as LogicGates from './logic';
import { LogEqLangCompiler, BuildError } from './logeqCompiler';
import { setupEvent, screenToWorld, getElementAt, getSelectionWorldRect, getElementsInRect, clamp, formatString, fillCoordMapWithElements, getScale, countSubstr } from './utils/utils';
import { connectSelected, connectTool, disconnectSelected, fillCoordMapWithCoords, fillCTSources, getVectorFrom2Points, getVectorFrom3Points, initConnectTool, makeGhostEl } from './utils/connectionTool';
import { drawingTimer } from './drawings';
import { changeWireDrawingAlg } from "./drawings";
let canvases: Record<Drawings, HTMLCanvasElement | null>;
export const camera: Camera = { x: 0, y: 0, zoom: 1 };
export const circuit = new LogicGates.Circuit();
export let elementUnderCursor: LogicGates.LogicElement | null;
export let isSimulating = false;
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
export let selectionColor: vec4 = colors.selection;
export let selectedElements = new Set<LogicGates.LogicElement>();
let selectionSet: Set<LogicGates.LogicElement>;
export const customOverlays: Map<LogicGates.LogicElement, { icon: string, color: number }> = new Map();
export const ghostElements: Set<ElementPDO> = new Set();

export let selectedTool: ToolMode = ToolMode.Cursor; // 'move' или 'connect'
let copyWiresMode: CopyWiresMode = CopyWiresMode.Inner; // режим по умолчанию
export let showWiresMode: ShowWiresMode = ShowWiresMode.Connect; // режим по умолчанию

let fileIO: FileIO;
let circuitIO: CircuitIO;
let logEqParser: LogEqLangCompiler = new LogEqLangCompiler();

// if (import.meta.env.PROD && 'serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/sw.js')
//     .then(() => navigator.serviceWorker.ready.then((worker) => {
//       (worker as any).sync.register('syncdata');
//     }))
//     .catch((err) => console.log(err));
// }

const i18n = new I18n(locales, 'en')

const toggleLocale = () => {
  i18n.setLocale(settings.locale as typeof i18n['localeName'])
  updateCopyWiresButtonText()
  updateShowWiresButtonText()
  updateConnectModeButtonText()
  fileIO.updateFilenameDisplay()
  resizeFMs()
}
function toggleFM(id: string, resetPos: boolean) {
  const floatingMenu = document.getElementById(id);
  if (floatingMenu) {
    floatingMenu?.classList.toggle('hidden');
    if (resetPos) (floatingMenu?.querySelector('.floating-menu-container') as HTMLElement).style = '';
    clampFMCoords(floatingMenu);
  }
}

export const settings = {
  theme: 'system' as Themes,
  locale: 'en' as LocaleNames,
  drawing: 'webgl' as Drawings,
  wireDrawing: 'simple' as WireDrawings,
  maxFPS: 60,
  drawIcons: true
}

function getSettingsFromLS() {
  const lsKey = 'settings';
  const newSettings = JSON.parse(localStorage.getItem(lsKey) || '{}');
  settings.theme = newSettings.theme ?? settings.theme;
  settings.locale = newSettings.locale ?? settings.locale;
  settings.drawing = newSettings.drawing ?? settings.drawing;
  settings.maxFPS = newSettings.maxFPS ?? settings.maxFPS;
  settings.drawIcons = newSettings.drawIcons ?? settings.drawIcons;

  let setting;
  if (setting = document.getElementById('theme-select'))
    (<HTMLInputElement>setting).value = settings.theme;
  if (setting = document.getElementById('locale-select'))
    (<HTMLInputElement>setting).value = settings.locale;
  if (setting = document.getElementById('drawing-select'))
    (<HTMLInputElement>setting).value = settings.drawing;
  if (setting = document.getElementById('wire-drawing-select'))
    (<HTMLInputElement>setting).value = settings.wireDrawing;
  if (setting = document.getElementById('max-fps-range')) {
    (<HTMLInputElement>setting).value = settings.maxFPS.toString();
    const maxFpsValueDisplay = document.getElementById('max-fps-value');
    if (maxFpsValueDisplay !== null)
      (maxFpsValueDisplay).innerText = (<HTMLInputElement>setting).value;
  }
  if (setting = document.getElementById('draw-icons-check'))
    (<HTMLInputElement>setting).checked = settings.drawIcons;

  pushSettingsToLS();
}

function pushSettingsToLS() {
  const lsKey = 'settings';
  localStorage.setItem(lsKey, JSON.stringify(settings));
}

function displayLineNumbers(linesContainer: HTMLElement, textContainer: HTMLTextAreaElement) {
  const lines = countSubstr(textContainer.value, '\n') + 1;
  linesContainer.innerHTML = Array.from({
    length: lines,
  }, (_, i) => `<div>${i + 1}</div>`).join('');
}

window.onload = (() => {
  // Инициализация
  getSettingsFromLS();
  setupEvent('dots-toggle', "click", () => document.getElementById('dots-menu')?.classList.toggle('hidden'));
  setupEvent('user-manual-toggle', "click", () => toggleFM('fm-user-manual', true));
  setupEvent('settings-toggle', "click", () => toggleFM('fm-settings', true));
  setupEvent('simulation-toggle', "click", () => toggleFM('fm-simulation', false));
  setupEvent('file-toggle', "click", () => toggleFM('fm-file', false));
  setupEvent('tools-toggle', "click", () => toggleFM('fm-tools', false));
  setupEvent('palette-toggle', "click", () => toggleFM('fm-palette', false));
  const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const toggleThemeOnChange = () => {
    switch (settings.theme) {
      case 'light': toggleTheme(false); break;
      case 'dark': toggleTheme(true); break;
      case 'system': toggleTheme(prefersDarkScheme.matches); break;
    }
  };
  prefersDarkScheme.addEventListener('change', toggleThemeOnChange);
  setupEvent('theme-select', "change", (e) => {
    const theme = (<HTMLInputElement>e.target).value;
    if (Themes.includes(<Themes>theme)) {
      settings.theme = <Themes>theme;
      pushSettingsToLS();
      toggleThemeOnChange();
    }
  });
  setupEvent('wire-drawing-select', "change", (e) => {
    const wireDrawing = (<HTMLInputElement>e.target).value;
    if (WireDrawings.includes(<WireDrawings>wireDrawing)) {
      settings.wireDrawing = <WireDrawings>wireDrawing;
      pushSettingsToLS();
      changeWireDrawingAlg();
      drawingTimer.step();
    }
  });
  setupEvent('locale-select', "change", (e) => {
    const locale = (<HTMLInputElement>e.target).value;
    if (Object.keys(locales).includes(<LocaleNames>locale)) {
      settings.locale = <LocaleNames>locale;
      pushSettingsToLS();
      toggleLocale();
    }
  });
  setupEvent('draw-icons-check', "change", (e) => {
    const drawIcons = (<HTMLInputElement>e.target).checked;
    settings.drawIcons = drawIcons;
    pushSettingsToLS();
    drawingTimer.step();
  });
  setupEvent('drawing-select', "change", (e) => {
    const drawing = (<HTMLInputElement>e.target).value;
    if (Drawings.includes(<Drawings>drawing)) {
      settings.drawing = <Drawings>drawing;
      pushSettingsToLS();
      drawingTimer.changeDrawing();
      for (const [k, v] of Object.entries(canvases)) {
        if (v === null) continue;
        if (k === settings.drawing) addCanvasEventListeners(v);
        else removeCanvasEventListeners(v);
        v.classList.toggle('hidden', k !== settings.drawing);
      }
    }
  });
  const maxFpsValueDisplay = document.getElementById('max-fps-value');
  setupEvent('max-fps-range', 'change', (e) => {
    const maxFPS = parseInt((<HTMLInputElement>e.target).value);
    if (Number.isInteger(maxFPS)) {
      settings.maxFPS = maxFPS;
      pushSettingsToLS();
      drawingTimer.changeMaxFPS();
    }
  })
  setupEvent('max-fps-range', 'input', (e) => {
    if (maxFpsValueDisplay !== null)
      (maxFpsValueDisplay).innerText = (<HTMLInputElement>e.target).value;
  })

  updateToolButtons(document.querySelector("#tool-move") as HTMLElement);

  const colorPicker = document.querySelector("#tool-color-picker") as HTMLInputElement;
  circuitIO = new CircuitIO(circuit, colorPicker, camera);
  fileIO = new FileIO(i18n, circuitIO, document.getElementById("filename-display") as HTMLSpanElement);

  canvases = {
    'canvas': document.getElementById('canvas-canvas') as HTMLCanvasElement,
    'webgl': document.getElementById('webgl-canvas') as HTMLCanvasElement
  }
  drawingTimer.setCanvases(canvases);
  const scale = getScale();
  for (const [k, canvas] of Object.entries(canvases)) {
    if (canvas === null) continue;
    canvas.width = window.innerWidth * scale;
    canvas.height = window.innerHeight * scale;
    canvas.classList.toggle('hidden', k !== settings.drawing);
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
    });
  }
  if (canvases[settings.drawing] !== null)
    addCanvasEventListeners(canvases[settings.drawing]!);

  updateCopyWiresButtonText();
  updateShowWiresButtonText();
  updateConnectModeButtonText();
  drawingTimer.changeMaxFPS();
  drawingTimer.changeDrawing();
  toggleThemeOnChange();
  toggleLocale();

  // Привязка кнопок
  setupEvent('save-scheme', 'click', fileIO.save);
  setupEvent('load-scheme', 'click', () => fileIO.load(false));
  setupEvent('add-scheme', 'click', () => fileIO.load(true));
  setupEvent('copy-wires-mode-btn', 'click', cycleCopyWiresMode);
  setupEvent('show-wires-mode-btn', 'click', cycleShowWiresMode);
  setupEvent('connect-mode-btn', 'click', cycleConnectMode);

  // Toolbar buttons
  ['and', 'or', 'xor', 'nand', 'nor', 'xnor', 't_flop', 'timer', 'button', 'switch', 'output'].forEach(id => {
    const el = document.getElementById('add-' + id);
    const type = id.toUpperCase();
    if (el) {
      el.onclick = () => {
        circuitIO.addElement(type, {});
        drawingTimer.step();
      };
    }


  });
  const switchTool = (e: Event, toolMode: ToolMode) => {
    if (selectedTool === toolMode) return;
    selectedTool = toolMode;
    clearSelection();
    updateToolButtons(e.target as HTMLElement);
    drawingTimer.step();
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
      drawingTimer.setup();
    }
  });

  setupEvent('step-sim', 'click', () => {
    isSimulating = false;
    clearInterval(simInterval);
    optimizedStep();
    drawingTimer.stop();
    drawingTimer.step();
  });

  setupEvent('stop-sim', 'click', () => {
    isSimulating = false;
    clearInterval(simInterval);
    drawingTimer.stop();
  });
  setupEvent('speed-sim', 'change', () => {
    if (isSimulating) {
      clearInterval(simInterval);
      const clock = (document.getElementById('speed-sim') as HTMLInputElement);
      const min = parseInt(clock.getAttribute('min') || "1");
      const max = parseInt(clock.getAttribute('max') || "1000");
      const value = Math.max(min, Math.min(parseInt(clock.innerHTML || clock.value || "40"), max));
      clock.value = value.toString();
      simInterval = setInterval(optimizedStep, 1000 / value);
      drawingTimer.setup();
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
        const x = clamp(floatingMenu.offsetLeft - (mouse.x - e.clientX), 20, window.innerWidth - parseInt(getStyleFMH.width) - 55);
        const y = clamp(floatingMenu.offsetTop - (mouse.y - e.clientY), 20, window.innerHeight - parseInt(getStyleFMH.height) - 55);
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
  const logEqLines = document.getElementById("logeq-lines") as HTMLElement;
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
      const logEqConsole = document.getElementById('logeq-console');
      try {
        const [tokens, unknownTokens] = logEqParser.tokenize(logEqText.value);
        if (unknownTokens.length) {
          let row = i18n.getValue("logeq-lexer", "lexer-errors");
          let html = row + ':';
          let i = 0;
          for (const token of unknownTokens) {
            row = logEqParser.highlighter(logEqText.value, token.position, token.lexeme.length);
            html += `\n${row}`;
            console.log(row);
            row = `[${token.line}:${token.column}] ${i18n.getValue("logeq-lexer", token.type) || token.type}: ${token.lexeme}`;
            html += `\n - ${row}`;
            console.log(row);
          }
          if (logEqConsole) {
            logEqConsole.innerText = html;
            logEqConsole.style.color = 'red';
          }
          return;
        }
        const parsed = logEqParser.parse(tokens);

        // logEqParser.printAST(parsed.ast);
        if (parsed.errors.length) {
          let row = i18n.getValue("logeq-parser", "compilation-errors");
          let html = row + ':';
          console.log(row);
          parsed.errors.forEach(err => {
            row = `[${err.token.line}:${err.token.column}] ${i18n.getValue("logeq-parser", err.message) || err.message}`;
            console.log(row);
            html += `\n - ${row}`;
          });
          if (logEqConsole) {
            logEqConsole.innerText = html;
            logEqConsole.style.color = 'red';
          }
          return;
        }

        const layers = logEqParser.buildFromAst(parsed.ast, logEqFlatten.checked);
        // logEqParser.printCircuit(layers);
        const newEls = circuitIO.fromLayers(layers, logEqInputEl.value);
        selectedElements.clear();
        for (const newEl of newEls) {
          selectedElements.add(newEl);
        }
        if (logEqConsole) {
          logEqConsole.innerHTML = i18n.getValue("dynamic", 'success');
          logEqConsole.style.color = 'green';
        }
        drawingTimer.step();

      }
      catch (error: any) {
        let row, html;
        if (error instanceof BuildError) {
          row = `BuildError: [${error.pos.line}:${error.pos.column}] ` +
            formatString(i18n.getValue("logeq-builder", error.message) || error.message, error.args);
          html = row;
          console.log(row);
        }
        else {
          html = error.message;
          console.error(error.message);
          if (error.stack) {
            console.error(error.stack);
          }
        }
        if (logEqConsole) {
          logEqConsole.innerText = html;
          logEqConsole.style.color = 'red';
        }
      }
    }

  });
  setupEvent('logeq-text', 'input', (e) => {
    if (e instanceof InputEvent && e.inputType !== 'insertText') {
      displayLineNumbers(logEqLines, logEqText);
    }
  })
  const textareaStyles = window.getComputedStyle(logEqText);
  [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'padding',
  ].forEach((property: any) => {
    logEqLines.style[property] = textareaStyles[property];
  });
  logEqText.addEventListener('scroll', () => {
    logEqLines.scrollTop = logEqText.scrollTop / logEqText.scrollHeight * logEqLines.scrollHeight;
  });
  const ro = new ResizeObserver(() => {
    logEqLines.style.height = `${logEqText.clientHeight - 15}px`;
  });
  ro.observe(logEqText);
  displayLineNumbers(logEqLines, logEqText);
  // Ctrl+S обработчик
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      fileIO.save();
    }
  });
  getCircuitFromLS();
  drawingTimer.step();
  setInterval(() => circuitIO.clearUnusedChunks(), 5000);
});

function removeCanvasEventListeners(_canvas: HTMLCanvasElement) {
  _canvas.removeEventListener('wheel', onCanvasWheel);
  _canvas.removeEventListener('mouseup', onCanvasMouseUp);
  _canvas.removeEventListener('mouseout', onCanvasMouseOut);
  _canvas.removeEventListener('mousemove', onCanvasMouseMove);
  _canvas.removeEventListener('mousedown', onCanvasMouseDown);
}

function addCanvasEventListeners(_canvas: HTMLCanvasElement) {
  _canvas.addEventListener('wheel', onCanvasWheel);
  _canvas.addEventListener('mouseup', onCanvasMouseUp);
  _canvas.addEventListener('mouseout', onCanvasMouseOut);
  _canvas.addEventListener('mousemove', onCanvasMouseMove);
  _canvas.addEventListener('mousedown', onCanvasMouseDown);
}


window.addEventListener('resize', () => {
  const scale = getScale();
  const canvas = drawingTimer.currentCanvas();
  canvas.width = window.innerWidth * scale;
  canvas.height = window.innerHeight * scale;

  const floatingMenus = document.querySelectorAll(".floating-menu") as NodeListOf<HTMLElement>;
  for (const floatingMenu of floatingMenus) {
    clampFMCoords(floatingMenu);
  }

  drawingTimer.step();
});

function clampFMCoords(floatingMenu: HTMLElement) {
  const getStyleFM = window.getComputedStyle(floatingMenu);
  const x = clamp(parseInt(getStyleFM.left), 20, window.innerWidth - parseInt(getStyleFM.width) - 55);
  const y = clamp(parseInt(getStyleFM.top), 20, window.innerHeight - parseInt(getStyleFM.height) - 55);
  floatingMenu.style.left = `${x}px`;
  floatingMenu.style.top = `${y}px`;
}

function resizeFMs() {
  const floatingMenus = document.querySelectorAll(".floating-menu") as NodeListOf<HTMLElement>;
  for (const floatingMenu of floatingMenus) {
    floatingMenu.style.width = "";
    const getStyleFM = window.getComputedStyle(floatingMenu);
    floatingMenu.style.width = getStyleFM.width;
  }
}

function toggleTheme(setDark?: boolean) {
  const htmlElement = document.documentElement;

  setDark = setDark ?? (htmlElement.getAttribute('data-theme') !== 'dark');

  if (setDark) htmlElement.setAttribute('data-theme', 'dark');
  else htmlElement.removeAttribute('data-theme');

  if (setDark) {
    colors.grid = [0, 0, 0, 1];
    colors.background = [0.1, 0.1, 0.1, 1];
  } else {
    colors.grid = [0.8, 0.8, 0.8, 1];
    colors.background = [0.9, 0.9, 0.9, 1];
  }
  drawingTimer.step();
}

// Оптимизация симуляции
function optimizedStep() {
  circuit.step();
}

function clearCanvas() {
  if (confirm('Вы уверены, что хотите очистить холст?')) {
    circuit.clear();
    camera.x = 0;
    camera.y = 0;
    fileIO.clearFileHandle();
    clearCircuitInLS();
    clearSelection();
    clearInterval(simInterval);
    isSimulating = false;
    drawingTimer.stop();
    drawingTimer.step();
  }
}

export function clearSelection() {
  for (const s of connectTool.sources) s.clear();
  connectTool.coordMap.clear();
  selectedElements.clear();
}

function updateCopyWiresButtonText() {
  updateModeButtonText(
    'copy-wires-mode-btn',
    copyWiresMode,
    ['copy-wires-mode', 'none', 'inner', 'all'],
    ['Copy wires', 'None', 'Inner', 'All']
  );
}

function updateShowWiresButtonText() {
  updateModeButtonText(
    'show-wires-mode-btn',
    showWiresMode,
    ['show-wires-mode', 'none', 'connect', 'temporary', 'always'],
    ['Show wires', 'None', 'Connect', 'Temporary', 'Always']
  );
}

function updateConnectModeButtonText() {
  updateModeButtonText(
    'connect-mode-btn',
    connectTool.mode,
    ['connect-mode', 'nton', 'sequence', 'parallel', 'decoder'],
    ['Connect', 'N to N', 'Sequence', 'Parallel', 'Decoder']
  );
}

function updateModeButtonText(
  btnId: string,
  modeVar: number,
  i18nKeys: string[],
  defaultTexts: string[]
) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.textContent = (i18n.getValue('dynamic', i18nKeys[0]) || defaultTexts[0]) + ': ' +
    (i18n.getValue('dynamic', i18nKeys[modeVar + 1]) || defaultTexts[modeVar + 1]);
}


function cycleCopyWiresMode() {
  copyWiresMode = (copyWiresMode + 1) % 3;
  updateCopyWiresButtonText();
}

function cycleShowWiresMode() {
  showWiresMode = (showWiresMode + 1) % 4;
  updateShowWiresButtonText();
  drawingTimer.step();
}

function cycleConnectMode(e: Event) {
  connectTool.mode = ((4 + connectTool.mode + ((<MouseEvent>e)?.shiftKey ? -1 : 1)) % 4) as ConnectMode;
  customOverlays.clear();
  ghostElements.clear();
  clearSelection();
  connectTool.targets.length = 0;
  drawingTimer.step();
  updateConnectModeButtonText();
}



function onCanvasMouseDown(e: MouseEvent) {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  const el = getElementAt(circuit, camera, { x: mouseX, y: mouseY }, true);
  console.log(el);
  if (el) {
    if (e.button === 1) {
      if (elementUnderCursor === el)
        elementUnderCursor = null;
      else
        elementUnderCursor = el;
    } else if (selectedTool === ToolMode.Connect) {
      initConnectTool(connectTool.mode);
      if (connectTool.mode === ConnectMode.NtoN) {
        connectTool.canConnect = true;
        if (e.button === 0) {
          if (!LogicGates.isOutputElement(el)) {
            if (!connectTool.sources[0].has(el)) {
              connectTool.sources[0].add(el);
            } else {
              connectTool.sources[0].delete(el);
            }
          }
        } else if (e.button === 2) {
          if (!LogicGates.isInputElement(el)) {
            if (!connectTool.sources[1].has(el)) {
              connectTool.sources[1].add(el);
            } else {
              connectTool.sources[1].delete(el);
            }
          }
        }
      } else if (connectTool.mode === ConnectMode.Sequence) {
        let elIndex = connectTool.targets.indexOf(el);
        clearSelection();
        ghostElements.clear();
        if (elIndex === -1) {
          let nullIndex = connectTool.targets.indexOf(null);
          if (nullIndex === -1) {
            if (connectTool.targets[2] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[2]);
            nullIndex = 2;
          }
          connectTool.targets[nullIndex] = el;
          elIndex = nullIndex;
          customOverlays.set(el, { icon: ['a0', 'a1', 'an'][nullIndex], color: 7 });
          nullIndex = connectTool.targets.indexOf(null);

          let targetEl: LogicGates.LogicElement | ElementPDO | null = el;
          if (nullIndex === -1) {
            if (connectTool.targets[2] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[2]);
            connectTool.vectors[0] = getVectorFrom3Points(
              connectTool.targets[0]!,
              connectTool.targets[1]!,
              connectTool.targets[2]!,
            );

            if (connectTool.vectors[0].length !== 0) {
              const pointN = {
                x: connectTool.targets[0]!.x + connectTool.vectors[0].x * connectTool.vectors[0].length,
                y: connectTool.targets[0]!.y + connectTool.vectors[0].y * connectTool.vectors[0].length,
              }
              targetEl = getElementAt(circuit, camera, pointN, false);
            }
            if (targetEl === connectTool.targets[0] || targetEl === connectTool.targets[1]) targetEl = null;
            if (targetEl instanceof LogicGates.LogicElement) customOverlays.set(targetEl, { icon: 'an', color: 7 });
            connectTool.targets[2] = targetEl;
          }
          const rows: (string[] | null)[] = [
            connectTool.vectors[0]?.length ? fillCoordMapWithCoords(connectTool.targets[0]!, connectTool.vectors[0], connectTool.vectors[0].length) : null
          ];
          fillCoordMapWithElements(circuit, connectTool.coordMap);

          const check = (_: number, v: LogicGates.LogicElement) => {
            return (connectTool.sources[0].size !== 0 && LogicGates.isInputElement(v)) ||
              (connectTool.sources[0].size !== connectTool.coordMap.size - 1 && LogicGates.isOutputElement(v));
          }
          fillCTSources(rows, check);
        } else {
          if (el instanceof LogicGates.LogicElement) customOverlays.delete(el);
          connectTool.targets[elIndex] = null;
          connectTool.vectors[0] = { x: 0, y: 0, length: 0 };
        }
      } else if (connectTool.mode === ConnectMode.Parallel) {
        let elIndex = connectTool.targets.indexOf(el);
        clearSelection();
        ghostElements.clear();
        if (elIndex === -1 || elIndex === 5) {
          let nullIndex = connectTool.targets.indexOf(null);
          if (nullIndex === -1 || nullIndex === 5 || elIndex === 5) {
            if (connectTool.targets[4] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[4]);
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.targets[5] = null;
            nullIndex = 4;
          }
          connectTool.targets[nullIndex] = el;
          elIndex = nullIndex;
          if (nullIndex < 3) customOverlays.set(el, { icon: ['a0', 'a1', 'an'][nullIndex], color: 7 });
          else if (nullIndex < 5) customOverlays.set(el, { icon: ['b0', 'b1', 'bn'][nullIndex - 3], color: 8 });
          nullIndex = connectTool.targets.indexOf(null);

          let targetEl: LogicGates.LogicElement | ElementPDO | null = null;
          if ((nullIndex === -1 || nullIndex > 2) && elIndex < 3) {
            connectTool.vectors[0] = getVectorFrom3Points(
              connectTool.targets[0]!,
              connectTool.targets[1]!,
              connectTool.targets[2]!,
            );
            if (connectTool.vectors[0].length !== 0) {
              const pointN = {
                x: connectTool.targets[0]!.x + connectTool.vectors[0].x * connectTool.vectors[0].length,
                y: connectTool.targets[0]!.y + connectTool.vectors[0].y * connectTool.vectors[0].length,
              }
              targetEl = getElementAt(circuit, camera, pointN, false);
            }
            if (targetEl === connectTool.targets[0] || targetEl === connectTool.targets[1]) targetEl = null;
            if (connectTool.targets[2] !== targetEl && connectTool.targets[2] instanceof LogicGates.LogicElement)
              customOverlays.delete(connectTool.targets[2]);
            connectTool.targets[2] = targetEl;
            elIndex = 5;
            nullIndex = connectTool.targets.indexOf(null); targetEl = null;
          }
          if ((nullIndex === -1 || nullIndex === 5) && elIndex > 2) {
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.vectors[1] = getVectorFrom2Points(
              connectTool.targets[3]!,
              connectTool.targets[4]!,
              connectTool.vectors[0].length
            );
            if (connectTool.vectors[1].length !== 0) {
              const pointN = {
                x: connectTool.targets[3]!.x + connectTool.vectors[1].x * connectTool.vectors[1].length,
                y: connectTool.targets[3]!.y + connectTool.vectors[1].y * connectTool.vectors[1].length,
              }
              targetEl = getElementAt(circuit, camera, pointN, false);
            }
            if (targetEl === connectTool.targets[3] || targetEl === connectTool.targets[4]) targetEl = null;
            if (targetEl instanceof LogicGates.LogicElement) customOverlays.set(targetEl, { icon: 'bn', color: 8 });
            connectTool.targets[5] = targetEl;
          }
        } else {
          if (el instanceof LogicGates.LogicElement) customOverlays.delete(el);
          connectTool.targets[elIndex] = null;

          if (elIndex < 3) {
            connectTool.vectors[0] = { x: 0, y: 0, length: 0 };
            connectTool.vectors[1] = { x: 0, y: 0, length: 0 };
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.targets[5] = null;
          } else if (elIndex < 5) {
            connectTool.vectors[1] = { x: 0, y: 0, length: 0 };
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.targets[5] = null;
          }
        }
        const rows: (string[] | null)[] = [
          connectTool.vectors[0]?.length ? fillCoordMapWithCoords(connectTool.targets[0]!, connectTool.vectors[0], connectTool.vectors[0].length) : null,
          connectTool.vectors[1]?.length ? fillCoordMapWithCoords(connectTool.targets[3]!, connectTool.vectors[1], connectTool.vectors[1].length) : null
        ];
        fillCoordMapWithElements(circuit, connectTool.coordMap);

        const check = (i: number, v: LogicGates.LogicElement) => {
          return i === 0 && LogicGates.isOutputElement(v) ||
            i === 1 && LogicGates.isInputElement(v);
        }
        fillCTSources(rows, check);
      } else if (connectTool.mode === ConnectMode.Decoder) {
        let elIndex = connectTool.targets.indexOf(el);

        clearSelection();
        ghostElements.clear();

        if (elIndex === -1 || elIndex === 5 || elIndex === 8) {
          let nullIndex = connectTool.targets.indexOf(null);
          if (nullIndex === -1 || nullIndex === 8 || elIndex === 8) {
            if (connectTool.targets[7] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[7]);
            if (connectTool.targets[8] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[8]);
            connectTool.targets[8] = null;
            nullIndex = 7;
          } else if (nullIndex === 5 || elIndex === 5) {
            if (connectTool.targets[4] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[4]);
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.targets[5] = null;
            nullIndex = 4;
          }
          connectTool.targets[nullIndex] = el;
          elIndex = nullIndex;
          if (nullIndex < 3) customOverlays.set(el, { icon: ['a0', 'a1', 'an'][nullIndex], color: 7 });
          else if (nullIndex < 6) customOverlays.set(el, { icon: ['b0', 'b1', 'bn'][nullIndex - 3], color: 8 });
          else if (nullIndex < 9) customOverlays.set(el, { icon: ['r0', 'r1', 'rn'][nullIndex - 6], color: 9 });
          nullIndex = connectTool.targets.indexOf(null);

          let targetEl: LogicGates.LogicElement | ElementPDO | null = null;
          if (nullIndex > 2 && elIndex < 3) {
            if (connectTool.targets[2] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[2]);
            connectTool.vectors[0] = getVectorFrom3Points(
              connectTool.targets[0]!,
              connectTool.targets[1]!,
              connectTool.targets[2]!,
            );
            if (connectTool.vectors[0].length !== 0) {
              const pointN = {
                x: connectTool.targets[0]!.x + connectTool.vectors[0].x * connectTool.vectors[0].length,
                y: connectTool.targets[0]!.y + connectTool.vectors[0].y * connectTool.vectors[0].length,
              }
              targetEl = getElementAt(circuit, camera, pointN, false);
            }
            if (targetEl === connectTool.targets[0] || targetEl === connectTool.targets[1]) targetEl = null;
            if (targetEl instanceof LogicGates.LogicElement) customOverlays.set(targetEl, { icon: 'an', color: 7 });
            connectTool.targets[2] = targetEl;
            elIndex = 5;
            nullIndex = connectTool.targets.indexOf(null); targetEl = null;
          }
          if ((nullIndex === -1 || nullIndex === 5) && elIndex > 2) {
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.vectors[1] = getVectorFrom2Points(
              connectTool.targets[3]!,
              connectTool.targets[4]!,
              connectTool.vectors[0].length
            );
            if (connectTool.vectors[1].length !== 0) {
              const pointN = {
                x: connectTool.targets[3]!.x + connectTool.vectors[1].x * connectTool.vectors[1].length,
                y: connectTool.targets[3]!.y + connectTool.vectors[1].y * connectTool.vectors[1].length,
              }
              targetEl = getElementAt(circuit, camera, pointN, false) || makeGhostEl(pointN);
            }
            if (targetEl === connectTool.targets[3] || targetEl === connectTool.targets[4]) targetEl = null;
            if (targetEl instanceof LogicGates.LogicElement) customOverlays.set(targetEl, { icon: 'bn', color: 8 });
            connectTool.targets[5] = targetEl;
            elIndex = 8
            nullIndex = connectTool.targets.indexOf(null); targetEl = null;
          }
          if ((nullIndex === -1 || nullIndex === 8) && elIndex > 5) {
            if (connectTool.targets[8] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[8]);
            connectTool.vectors[2] = getVectorFrom2Points(
              connectTool.targets[6]!,
              connectTool.targets[7]!,
              Math.pow(2, connectTool.vectors[0].length + 1) - 1
            );
            if (connectTool.vectors[2].length !== 0) {
              const pointN = {
                x: connectTool.targets[6]!.x + connectTool.vectors[2].x * connectTool.vectors[2].length,
                y: connectTool.targets[6]!.y + connectTool.vectors[2].y * connectTool.vectors[2].length,
              }
              targetEl = getElementAt(circuit, camera, pointN, false) || makeGhostEl(pointN);
            }
            if (targetEl === connectTool.targets[6] || targetEl === connectTool.targets[7]) targetEl = null;
            if (targetEl instanceof LogicGates.LogicElement) customOverlays.set(targetEl, { icon: 'rn', color: 9 });
            connectTool.targets[8] = targetEl;
          }
        } else {
          if (el instanceof LogicGates.LogicElement) customOverlays.delete(el);
          connectTool.targets[elIndex] = null;

          if (elIndex < 3) {
            connectTool.vectors[0] = { x: 0, y: 0, length: 0 };
            connectTool.vectors[1] = { x: 0, y: 0, length: 0 };
            connectTool.vectors[2] = { x: 0, y: 0, length: 0 };
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.targets[5] = null;
            if (connectTool.targets[8] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[8]);
            connectTool.targets[8] = null;
          } else if (elIndex < 5) {
            connectTool.vectors[1] = { x: 0, y: 0, length: 0 };
            connectTool.vectors[2] = { x: 0, y: 0, length: 0 };
            if (connectTool.targets[5] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[5]);
            connectTool.targets[5] = null;
          } else if (elIndex < 8) {
            connectTool.vectors[2] = { x: 0, y: 0, length: 0 };
            if (connectTool.targets[8] instanceof LogicGates.LogicElement) customOverlays.delete(connectTool.targets[8]);
            connectTool.targets[8] = null;
          }
        }
        const rows: (string[] | null)[] = [
          connectTool.vectors[0]?.length ? fillCoordMapWithCoords(connectTool.targets[0]!, connectTool.vectors[0], connectTool.vectors[0].length) : null,
          connectTool.vectors[1]?.length ? fillCoordMapWithCoords(connectTool.targets[3]!, connectTool.vectors[1], connectTool.vectors[1].length) : null,
          connectTool.vectors[2]?.length ? fillCoordMapWithCoords(connectTool.targets[6]!, connectTool.vectors[2], connectTool.vectors[2].length) : null,
        ];
        fillCoordMapWithElements(circuit, connectTool.coordMap);

        const check = (i: number, v: LogicGates.LogicElement) => {
          return i < 2 && LogicGates.isOutputElement(v) ||
            i === 2 && LogicGates.isInputElement(v);
        }
        fillCTSources(rows, check);
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
        drawingTimer.setup();
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
            if (newMode === gateTypeToMode.get('T_FLOP'))
              circuit.addWire(el, el);
            else
              circuit.removeWire(el, el);
            el.gateType = newMode;
            for (const elI of selectedElements) {
              if (elI instanceof LogicGates.LogicGate) {
                if (newMode === gateTypeToMode.get('T_FLOP'))
                  circuit.addWire(elI, elI);
                else
                  circuit.removeWire(elI, elI);
                elI.gateType = newMode;
              }
            }
            drawingTimer.step();
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
    else if (selectedTool === ToolMode.Connect && connectTool.mode === ConnectMode.NtoN && e.button === 0) {
      connectTool.canConnect = true;
      selectionColor = colors.source;
      selectionSet = connectTool.sources[0] as Set<LogicGates.LogicElement>;
    }
    else if (selectedTool === ToolMode.Connect && connectTool.mode === ConnectMode.NtoN && e.button === 2) {
      connectTool.canConnect = true;
      selectionColor = colors.target;
      selectionSet = connectTool.sources[1] as Set<LogicGates.LogicElement>;
    }
    else if (selectedTool === ToolMode.Paint && e.button === 0) {
      selectionColor = colors.paint;
      selectionSet = selectedElements;
    } else {
      isSelecting = false;
    }
    if (isSelecting) drawingTimer.setup();
  }
  if (e.button === 1) {
    prevMousePos.x = mouseX;
    prevMousePos.y = mouseY;
    isHandMoving = true;
    drawingTimer.setup();
  }


  drawingTimer.step();
}

function onCanvasMouseMove(e: MouseEvent) {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  let mouseWorld = screenToWorld(camera, mouseX, mouseY);

  if (isHandMoving) {
    camera.x -= (e.offsetX - prevMousePos.x);
    camera.y -= (e.offsetY - prevMousePos.y);
  } else if (isDragging && selectedElements.size > 0) {
    const deltaWorld = {
      x: Math.round(mouseWorld.x) - Math.round(prevMouseWorld.x),
      y: Math.round(mouseWorld.y) - Math.round(prevMouseWorld.y)
    }

    prevMouseWorld.x = mouseWorld.x;
    prevMouseWorld.y = mouseWorld.y;

    if (deltaWorld.x === 0 && deltaWorld.y === 0) return;
    for (const el of selectedElements)
      circuit.moveElementBy(el, deltaWorld);
  }
  else if (isSelecting) {
    selectionEnd = { x: e.offsetX, y: e.offsetY };
    const rect = getSelectionWorldRect(camera, selectionStart, selectionEnd);
    const { selected, selectionRect } = getElementsInRect(circuit, rect);
    if (e.ctrlKey && e.shiftKey)
      selected.forEach(el => selectionSet.delete(el));
    else if (e.shiftKey)
      selected.forEach(el => selectionSet.add(el));
    else {
      selectionSet.clear();
      selected.forEach(el => selectionSet.add(el));
    }
  }
  prevMousePos.x = e.offsetX;
  prevMousePos.y = e.offsetY;

}

function onCanvasMouseOut() {
  isHandMoving = false;
  isSelecting = false;
  isDragging = false;
  drawingTimer.stop();
  drawingTimer.step();
}

function zoomCanvas(isZoomIn: boolean, centerX: number, centerY: number) {
  const zoomFactor = 1.1;
  const scale = isZoomIn ? zoomFactor : 1 / zoomFactor;
  const h1 = camera.zoom * gridSize;
  const worldX = (camera.x + centerX) / h1;
  const worldY = (camera.y + centerY) / h1;

  camera.zoom = clamp(camera.zoom * scale, 0.35, maxZoom);
  const h2 = camera.zoom * gridSize;
  camera.x = worldX * h2 - centerX;
  camera.y = worldY * h2 - centerY;
}


function onCanvasWheel(e: WheelEvent) {
  e.preventDefault();
  zoomCanvas(e.deltaY < 0, e.offsetX, e.offsetY);
  drawingTimer.step();
}

function onCanvasMouseUp(e: MouseEvent) {
  if (isHandMoving && e.button === 1) {
    isHandMoving = false;
    drawingTimer.stop();
  }
  else {
    if (isSelecting || isDragging) {
      isSelecting = false;
      isDragging = false;
      drawingTimer.stop();
      drawingTimer.step();
    }
    e.stopPropagation();
  }

}

// Обработка клавиш
document.addEventListener('keydown', e => {
  if (document.activeElement === document.body) {
    if (e.code === 'Delete' && selectedElements.size > 0) {
      // Удаление выбранных элементов
      for (const element of selectedElements) {
        circuit.removeWiresForElement(element);
      }
      if (elementUnderCursor && selectedElements.has(elementUnderCursor))
        elementUnderCursor = null;
      selectedElements.forEach(el => circuit.deleteElement(el));
      clearSelection();
    } else if (e.code === '-' || e.code === '+') {
      zoomCanvas(e.code === '+', drawingTimer.currentCanvas().width / 2, drawingTimer.currentCanvas().height / 2);
    } else if (e.code === 'Escape') {
      clearSelection();
      ghostElements.clear();
      customOverlays.clear();
      connectTool.targets.length = 0;
      connectTool.vectors.length = 0;
    } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.code === 'KeyC') {
      document.getElementById('tool-connect')?.click();
    } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.code === 'KeyV') {
      document.getElementById('tool-move')?.click();
    } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.code === 'KeyP') {
      document.getElementById('tool-paint')?.click();
    } else if (e.altKey && e.code === 'KeyW') {
      cycleCopyWiresMode();
    } else if (e.shiftKey && e.code === 'KeyW') {
      cycleShowWiresMode();
    } else if (e.code === 'KeyR') {
      circuitIO.rotateSelected(selectedElements, e.shiftKey);
    } else if (e.code === 'KeyF') {
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
      for (const el of selectedElements)
        circuit.moveElementBy(el, deltaWorld);
    } else if (selectedTool === ToolMode.Cursor) {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        e.preventDefault();

        navigator.clipboard.writeText(circuitIO.serializeSelectedElements(selectedElements)).catch((err) => { console.log(err) });
      } else if (e.shiftKey && e.code === 'KeyV') {
        e.preventDefault();
        const cursorX = prevMousePos.x;
        const cursorY = prevMousePos.y;
        circuitIO.pasteSelectedElementsAtCursor(copyWiresMode, selectedElements, cursorX, cursorY);
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        e.preventDefault();
        const cursorX = prevMousePos.x;
        const cursorY = prevMousePos.y;
        navigator.clipboard.readText().then((json) => {
          try {
            const newElements = circuitIO.deserializeJSONAtPoint(copyWiresMode, json, screenToWorld(camera, cursorX, cursorY));
            selectedElements.clear();
            newElements.forEach(el => selectedElements.add(el));
            drawingTimer.step();
          } catch (err) {
            console.log(err);
          }
        }).catch(err => console.log(err));
      }
    } else if (selectedTool === ToolMode.Connect) {
      if (e.code === 'Enter') {
        connectSelected();
      }
      else if (e.code === 'Backspace') {
        disconnectSelected();
      }
    } else if (selectedTool === ToolMode.Paint) {
      if (e.code === 'Enter')
        circuitIO.paintSelected(selectedElements, null);
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const el = getElementAt(circuit, camera, prevMousePos, true);
        if (el) {
          navigator.clipboard.writeText(el.color).catch((err) => { console.log(err) });
        }
      }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        navigator.clipboard.readText().then((color) => {
          color = color.trim().replace('#', '');
          if (color.match('[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3}')) {
            if (color.length === 3) {
              color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
            }
            circuitIO.paintSelected(selectedElements, color);
            drawingTimer.step();
          }
        })
      }
    }
    drawingTimer.step();
  }


});

// Обновление кнопок инструментов
function updateToolButtons(pressedBtn?: HTMLElement) {
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.removeAttribute('active');
  });
  pressedBtn?.setAttribute('active', 'true');
}

function getCircuitFromLS() {
  const keyCircuit = 'backup-circuit';
  const keyName = 'backup-name';
  const text = localStorage.getItem(keyCircuit);
  if (text) {    
    circuitIO.deserializeCircuit(text);
    fileIO.clearFileHandle();
    const name = localStorage.getItem(keyName);
    const restoredTag = i18n.getValue('dynamic', 'restored') || 'Restored';
    if (name) {
      fileIO.currentFileName = name
      fileIO.updateFilenameDisplay(`${name} (${restoredTag})`);
    } else 
      fileIO.updateFilenameDisplay(`${fileIO.unnamed} (${restoredTag})`);
    drawingTimer.step();
  }
}
function clearCircuitInLS() {
  const keyCircuit = 'backup-circuit';
  const keyName = 'backup-name';
  localStorage.removeItem(keyCircuit);
  localStorage.removeItem(keyName);
}
function saveCircuitToLS() {
  const keyCircuit = 'backup-circuit';
  const keyName = 'backup-name';
  let isEmpty = true;
  if (circuit.chunks.size !== 0) {
    for (const chunk of circuit.chunks.values()) {
      if (chunk.size !== 0) {
        isEmpty = false;
        break;
      }
    }
  }
  if (isEmpty) return;
  const text = circuitIO.serializeCircuit();
  localStorage.setItem(keyCircuit, text);
  if (fileIO.currentFileName)
    localStorage.setItem(keyName, fileIO.currentFileName);
}

window.addEventListener("beforeunload", (e) => {
  // e.preventDefault();
  pushSettingsToLS();
  saveCircuitToLS();
});
