// main.js
import { CircuitIO } from './IOs/circuitIO';
import { colors, colorsThemed, ConnectMode, CopyWiresMode, Drawings, gateModeToType, gateTypeToMode, gridSize, GridStyle, locales, maxZoom, SelectionSets, ShowWiresMode, Themes, ToolMode, WireDrawings, type Camera, type ElementPDO, type LocaleNames, type Point, type vec4 } from './consts';
import { FileIO } from './IOs/fileIO';
import { I18n } from './utils/i18n';
import * as LogicGates from './logic';
import * as ChangePrompt from './utils/changePrompt';
import { LogEqLangCompiler, BuildError } from './logeqCompiler';
import { setupEvent, screenToWorld, getElementAt, getSelectionWorldRect, getElementsInRect, clamp, formatString, getScale, countSubstr, getSelectionCenter } from './utils/utils';
import { clearConnectTool, clearModeState, connectSelected, connectTool, disconnectSelected, handleElementClick, initConnectTool, processConnectToolMode, type ConnectToolTarget } from './utils/connectionTool';
import { drawingTimer } from './drawings';
import { resizeFMs, clampFMCoords, initFMs, saveFMsToLS } from './utils/floatingMenus';
import { HistoryManager, type HistoryAction } from './history';
import { initElementPalette } from './utils/palette';
import { ElementTooltip } from './utils/tooltip';
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
export let isHandMoving = false;
export let isSelecting = false;
export let isDragging = false;
export let selectionStart: Point = { x: 0, y: 0 };
export let selectionEnd: Point = { x: 0, y: 0 };
export let selectionColor: vec4 = colors.selection;
let selectionSetKey: SelectionSets = 'selection';
export let selectionSets: Record<SelectionSets, Set<LogicGates.LogicElement>> = {
  'selection': new Set(),
  'source': connectTool.sources[0] as Set<LogicGates.LogicElement>,
  'target': connectTool.sources[1] as Set<LogicGates.LogicElement>
};
export const customOverlays: Map<LogicGates.LogicElement, { icon: string, color: number }> = new Map();
export const ghostElements: Set<ElementPDO> = new Set();

export let selectedTool: ToolMode = ToolMode.Cursor; // 'move' или 'connect'
let copyWiresMode: CopyWiresMode = CopyWiresMode.Inner; // режим по умолчанию
export let showWiresMode: ShowWiresMode = ShowWiresMode.Connect; // режим по умолчанию

let tooltip: ElementTooltip;
export let historyManager: HistoryManager;
let fileIO: FileIO;
export let circuitIO: CircuitIO;
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
  grid: 'grid' as GridStyle,
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
  settings.grid = newSettings.grid ?? settings.grid;
  settings.wireDrawing = newSettings.wireDrawing ?? settings.wireDrawing;
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
  if (setting = document.getElementById('grid-select'))
    (<HTMLInputElement>setting).value = settings.grid;
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
  ChangePrompt.init();
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
      drawingTimer.step();
    }
  });
  setupEvent('grid-select', "change", (e) => {
    const gridStyle = (<HTMLInputElement>e.target).value;
    if (GridStyle.includes(<GridStyle>gridStyle)) {
      settings.grid = <GridStyle>gridStyle;
      pushSettingsToLS();
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
      window.dispatchEvent(new Event('resize'));
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
  const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
  const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;

  historyManager = new HistoryManager(circuit, circuitIO, {
    maxMemoryMB: 100,
    onHistoryChange: (canUndo, canRedo, undoStack, redoStack) => {
      // console.log(undoStack, redoStack);
      if (undoBtn) undoBtn.disabled = !canUndo;
      if (redoBtn) redoBtn.disabled = !canRedo;
    },
  });
  undoBtn.addEventListener('click', () => {
    switchToolAndMode(true);
    historyManager.undo();
    drawingTimer.step();
  });
  redoBtn.addEventListener('click', () => {
    switchToolAndMode(false);
    historyManager.redo();
    drawingTimer.step();
  });
  undoBtn.disabled = true;
  redoBtn.disabled = true;
  fileIO = new FileIO(i18n, circuitIO, historyManager);

  tooltip = new ElementTooltip(i18n, circuit, camera, historyManager);

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
  setupEvent('load-scheme', 'click', () => { if(clearCanvas()) fileIO.load(false)});
  setupEvent('add-scheme', 'click', () => fileIO.load(true));
  setupEvent('copy-wires-mode-btn', 'click', cycleCopyWiresMode);
  setupEvent('show-wires-mode-btn', 'click', cycleShowWiresMode);
  setupEvent('connect-mode-btn', 'click', cycleConnectMode);

  // Toolbar buttons
  initElementPalette();
  const switchTool = (e: Event, toolMode: ToolMode) => {
    if (selectedTool === toolMode) return;
    switch (toolMode) {
      case ToolMode.Cursor:
      case ToolMode.Paint:
        if (connectTool.mode === ConnectMode.NtoN) historyManager.recordSelectionsClear(selectedTool, ['source', 'target']);
        clearModeState();
        break;
      case ToolMode.Connect:
        historyManager.recordSelectionsClear(selectedTool, ['selection']);
        clearSelections(['selection']);
        processConnectToolMode();
        break;
    }
    selectedTool = toolMode;
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

  initFMs();
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
        const newEls = circuitIO.fromLayers(layers, logEqInputEl.value).toArray();
        historyManager.recordAddElements(newEls);
        historyManager.pushSelectionsState(['selection']);
        selectionSets['selection'] = new Set(newEls);
        historyManager.recordSelectionsChange(['selection']);

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
  setInterval(() => circuitIO.clearUnusedChunks(), 60000);
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



function toggleTheme(setDark?: boolean) {
  const htmlElement = document.documentElement;

  setDark = setDark ?? (htmlElement.getAttribute('data-theme') !== 'dark');

  if (setDark) htmlElement.setAttribute('data-theme', 'dark');
  else htmlElement.removeAttribute('data-theme');

  colors.grid = colorsThemed.grid[setDark ? 'dark' : 'light'];
  colors.background = colorsThemed.background[setDark ? 'dark' : 'light'];
  colors.wires = colorsThemed.wires[setDark ? 'dark' : 'light'];
  drawingTimer.step();
}

// Оптимизация симуляции
function optimizedStep() {
  circuit.step();
}

function clearCanvas() {
  if (confirm(i18n.getValue('dynamic', 'clear-canvas'))) {
    circuit.clear();
    elementUnderCursor = null;
    camera.x = 0;
    camera.y = 0;
    fileIO.clearFileHandle();
    clearCircuitInLS();
    clearSelections(SelectionSets.flat());
    clearConnectTool();
    clearInterval(simInterval);
    isSimulating = false;
    historyManager.clear();
    drawingTimer.stop();
    drawingTimer.step();
    return true;
  }
  return false;
}

export function clearSelections(keys: SelectionSets[]) {
  for (const key of keys)
    selectionSets[key].clear();
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
  updateConnectMode(((4 + connectTool.mode + ((<MouseEvent>e)?.shiftKey ? -1 : 1)) % 4) as ConnectMode);
}

function updateConnectMode(newMode: ConnectMode) {
  const oldMode = connectTool.mode;
  if (oldMode === newMode) return;
  if (oldMode === ConnectMode.NtoN) historyManager.recordSelectionsClear(selectedTool, ['source', 'target']);
  else historyManager.recordConnectTargetsClear(connectTool.targets, connectTool.mode);
  clearConnectTool();
  initConnectTool(newMode);
  updateConnectModeButtonText();
  drawingTimer.step();
}

function clickSelectElement(e: MouseEvent, el: LogicGates.LogicElement, key: SelectionSets) {
  const wasIn = selectionSets[key].has(el);
  if (e.shiftKey) {
    historyManager.recordSelectionClickChange(!wasIn, el, key);
    if (wasIn)
      selectionSets[key].delete(el);
    else
      selectionSets[key].add(el);
  } else if (!wasIn) {
    historyManager.recordSelectionClickClear(el, key);
    selectionSets[key].clear();
    selectionSets[key].add(el);
  }
}

function onCanvasMouseDown(e: MouseEvent) {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  const el = getElementAt(circuit, camera, { x: mouseX, y: mouseY }, true);
  // console.log(el);
  if (el) {
    if (e.button === 1) {
      if (elementUnderCursor === el)
        elementUnderCursor = null;
      else
        elementUnderCursor = el;
    } else if (selectedTool === ToolMode.Connect) {
      if (connectTool.mode === ConnectMode.NtoN) {
        clickSelectElement(e, el, e.button === 0 ? 'source' : 'target');
      } else {
        const { element, index } = handleElementClick(el) as { element: ConnectToolTarget; index: number; };
        historyManager.recordConnectTargetChange(element, el, index, connectTool.mode)
      }
    }
    else {
      if (e.button === 0) {
        clickSelectElement(e, el, 'selection');

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
          ChangePrompt.show(e, 'delay', el.delay.toString(),
            (value) => {
              const delay = value;
              const newDelay = Math.round(Number(delay));
              if (delay !== null && delay !== '' && !Number.isNaN(newDelay) && (0 <= newDelay && newDelay <= 1024)) {
                const oldDelays: Map<LogicGates.Timer, number> = new Map();

                function changeDelay(el: LogicGates.Timer) {
                  if (el.delay === newDelay) return;
                  oldDelays.set(el, el.delay);
                  el.setDelay(newDelay);
                }

                changeDelay(el);
                for (const elI of selectionSets['selection']) {
                  if (elI instanceof LogicGates.Timer) changeDelay(el);
                }
                historyManager.recordChangeTimerDelay(oldDelays, newDelay);
              }
            });
        } else if (el instanceof LogicGates.LogicGate) {
          ChangePrompt.show(e, 'gate', gateModeToType.get(el.gateType)!,
            (value) => {
              const mode = value.toUpperCase();
              if (gateTypeToMode.has(mode)) {
                const oldTypes: Map<LogicGates.LogicGate, number> = new Map();
                const newType = gateTypeToMode.get(mode)!;

                function changeGateMode(el: LogicGates.LogicGate, type: string) {
                  if (el.gateType === newType) return;
                  if (!oldTypes.has(el)) oldTypes.set(el, el.gateType);
                  if (type === 'T_FLOP') circuit.addWire(el, el);
                  else circuit.removeWire(el, el);
                  el.gateType = newType;
                }

                changeGateMode(el, mode);
                for (const elI of selectionSets['selection']) {
                  if (elI instanceof LogicGates.LogicGate) changeGateMode(elI, mode);
                }

                historyManager.recordChangeGateType(oldTypes, newType);
                drawingTimer.step();
              }
            });
        }
      }
    }
  } else if (!isSelecting) {
    isSelecting = true;
    selectionStart = { x: e.offsetX, y: e.offsetY };
    selectionEnd = { x: e.offsetX, y: e.offsetY };
    let selectionSet = selectionSets['selection'];
    if (selectedTool === ToolMode.Cursor && e.button === 0) {
      selectionColor = colors.selection;
      selectionSetKey = 'selection';
      selectionSet = selectionSets['selection'];
    }
    else if (selectedTool === ToolMode.Connect && connectTool.mode === ConnectMode.NtoN && e.button === 0) {
      connectTool.canConnect = true;
      selectionColor = colors.source;
      selectionSetKey = 'source';
      selectionSet = connectTool.sources[0] as Set<LogicGates.LogicElement>;
    }
    else if (selectedTool === ToolMode.Connect && connectTool.mode === ConnectMode.NtoN && e.button === 2) {
      connectTool.canConnect = true;
      selectionColor = colors.target;
      selectionSetKey = 'target';
      selectionSet = connectTool.sources[1] as Set<LogicGates.LogicElement>;
    }
    else if (selectedTool === ToolMode.Paint && e.button === 0) {
      selectionColor = colors.paint;
      selectionSet = selectionSets['selection'];
      selectionSetKey = 'selection';
    } else {
      isSelecting = false;
    }
    if (isSelecting) {
      selectionSets[selectionSetKey] = selectionSet;
      historyManager.pushSelectionsState([selectionSetKey]);
      drawingTimer.setup();
    }
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
    const dx = e.offsetX - prevMousePos.x;
    const dy = e.offsetY - prevMousePos.y;
    camera.x -= dx;
    camera.y -= dy;
    if (isSelecting) {
      selectionStart.x += dx;
      selectionStart.y += dy;
      selectionEnd.x += dx;
      selectionEnd.y += dy;
    }
  } else if (isDragging && selectionSets['selection'].size > 0) {
    const deltaWorld = {
      x: Math.round(mouseWorld.x) - Math.round(prevMouseWorld.x),
      y: Math.round(mouseWorld.y) - Math.round(prevMouseWorld.y)
    }

    prevMouseWorld.x = mouseWorld.x;
    prevMouseWorld.y = mouseWorld.y;

    if (deltaWorld.x === 0 && deltaWorld.y === 0) return;
    for (const el of selectionSets['selection'])
      circuit.moveElementBy(el, deltaWorld);
    historyManager.recordMoveElements(deltaWorld.x, deltaWorld.y);
  }
  else if (isSelecting) {
    selectionEnd = { x: e.offsetX, y: e.offsetY };
    const rect = getSelectionWorldRect(camera, selectionStart, selectionEnd);
    const { selected, selectionRect } = getElementsInRect(circuit, rect);
    if (e.ctrlKey && e.shiftKey)
      selected.forEach(el => selectionSets[selectionSetKey].delete(el));
    else if (e.shiftKey)
      selected.forEach(el => selectionSets[selectionSetKey].add(el));
    else {
      selectionSets[selectionSetKey].clear();
      selected.forEach(el => selectionSets[selectionSetKey].add(el));
    }
  }
  prevMousePos.x = e.offsetX;
  prevMousePos.y = e.offsetY;

}

function onCanvasMouseOut() {
  isHandMoving = false;
  stopSelecting()
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

  camera.zoom = clamp(Math.round(camera.zoom * scale * 50) / 50, 0.35, maxZoom);
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
    if (!isSelecting && !isDragging)
      drawingTimer.stop();
  }
  else {
    stopSelecting();
    isDragging = false;
    drawingTimer.stop();
    drawingTimer.step();
  }
}

function stopSelecting() {
  if (isSelecting) {
    historyManager.recordSelectionsChange([selectionSetKey]);
  }
  isSelecting = false;
}
// Обработка клавиш
document.addEventListener('keydown', e => {
  if (document.activeElement === document.body) {
    // console.log(e.code);
    if (e.key === '-' || e.key === '+') {
      zoomCanvas(e.key === '+', drawingTimer.currentCanvas().width / 2, drawingTimer.currentCanvas().height / 2);
      if (isDragging || isSelecting) drawingTimer.currentCanvas().dispatchEvent(new MouseEvent('mousemove', { clientX: prevMousePos.x, clientY: prevMousePos.y }));
    } else if (e.altKey && e.code === 'KeyW') {
      cycleCopyWiresMode();
    } else if (e.shiftKey && e.code === 'KeyW') {
      cycleShowWiresMode();
    } else if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow')) {
      const mul = (e.shiftKey ? 5 : 1) * gridSize;
      if (e.key === 'ArrowRight') {
        camera.x += mul;
        if (isSelecting) selectionStart.x -= mul;
      } else if (e.key === 'ArrowLeft') {
        camera.x -= mul;
        if (isSelecting) selectionStart.x += mul;
      } else if (e.key === 'ArrowUp') {
        camera.y -= mul;
        if (isSelecting) selectionStart.y += mul;
      } else if (e.key === 'ArrowDown') {
        camera.y += mul;
        if (isSelecting) selectionStart.y -= mul;
      }
      if (isDragging || isSelecting) drawingTimer.currentCanvas().dispatchEvent(new MouseEvent('mousemove', { clientX: prevMousePos.x, clientY: prevMousePos.y }));
    } else if (!isDragging && !isSelecting) {
      if (e.code === 'Delete') {
        deleteElements();
      } else if (e.code === 'Escape') {
        if (ChangePrompt.isHidden()) {
          const keys: SelectionSets[] = connectTool.mode === ConnectMode.NtoN ? ['selection', 'source', 'target'] : ['selection'];
          historyManager.recordSelectionsClear(selectedTool, keys);
          clearSelections(keys);
          if (connectTool.mode !== ConnectMode.NtoN) historyManager.recordConnectTargetsClear(connectTool.targets, connectTool.mode);
          clearConnectTool();
        } else ChangePrompt.cancel();
      } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.code === 'KeyC') {
        document.getElementById('tool-connect')?.click();
      } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.code === 'KeyV') {
        document.getElementById('tool-move')?.click();
      } else if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.code === 'KeyP') {
        document.getElementById('tool-paint')?.click();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        switchToolAndMode(true);
        historyManager.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) {
        e.preventDefault();
        switchToolAndMode(false);
        historyManager.redo();
      } else if (e.code === 'KeyR') {
        if (selectionSets['selection'].size > 1) {
          const center = getSelectionCenter(selectionSets['selection']);
          historyManager.recordRotateElements(center, e.shiftKey);
          circuitIO.rotateSelected(selectionSets['selection'], e.shiftKey, center);
        }
      } else if (e.code === 'KeyF') {
        if (selectionSets['selection'].size > 1) {
          const center = getSelectionCenter(selectionSets['selection']);
          historyManager.recordFlipElements(center, e.shiftKey);
          circuitIO.flipSelected(selectionSets['selection'], e.shiftKey, center);
        }
      } else if (e.key.startsWith('Arrow') && selectionSets['selection'].size > 0) {
        const deltaWorld = { x: 0, y: 0 };
        const mul = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowRight') deltaWorld.x = mul;
        else if (e.key === 'ArrowLeft') deltaWorld.x = -mul;
        else if (e.key === 'ArrowUp') deltaWorld.y = -mul;
        else if (e.key === 'ArrowDown') deltaWorld.y = mul;

        for (const el of selectionSets['selection'])
          circuit.moveElementBy(el, deltaWorld);
        historyManager.recordMoveElements(deltaWorld.x, deltaWorld.y);
      } else if (selectedTool === ToolMode.Cursor) {
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
          e.preventDefault();

          navigator.clipboard.writeText(circuitIO.serializeSelectedElements(selectionSets['selection'])).catch((err) => { console.log(err) });
        } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyX') {
          e.preventDefault();

          navigator.clipboard.writeText(circuitIO.serializeSelectedElements(selectionSets['selection'])).catch((err) => { console.log(err) });
          deleteElements();
        } else if (e.shiftKey && e.code === 'KeyV') {
          e.preventDefault();
          const cursorX = prevMousePos.x;
          const cursorY = prevMousePos.y;

          historyManager.pushSelectionsState(['selection']);
          selectionSets['selection'] = new Set(circuitIO.pasteSelectedElementsAtCursor(copyWiresMode, selectionSets['selection'], cursorX, cursorY));

          historyManager.recordDuplicateElements(Array.from(selectionSets['selection']));
          historyManager.recordSelectionsChange(['selection']);
          drawingTimer.step();
        } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
          e.preventDefault();
          const cursorX = prevMousePos.x;
          const cursorY = prevMousePos.y;
          navigator.clipboard.readText().then((json) => {
            try {
              historyManager.pushSelectionsState(['selection']);
              selectionSets['selection'] = new Set(circuitIO.deserializeJSONAtPoint(copyWiresMode, json, screenToWorld(camera, cursorX, cursorY)));

              historyManager.recordPasteElements(Array.from(selectionSets['selection']));
              historyManager.recordSelectionsChange(['selection']);
              drawingTimer.step();
            } catch (err) {
              console.log(err);
            }
          }).catch(err => console.log(err));
        }
      } else if (selectedTool === ToolMode.Connect) {
        if (e.code === 'Enter') {
          if (connectTool.canConnect) {
            if (connectTool.mode === ConnectMode.NtoN) historyManager.recordSelectionsClear(selectedTool, ['source', 'target']);
            else historyManager.recordConnectTargetsClear(connectTool.targets, connectTool.mode);
            const wires = connectSelected();
            if (wires)
              historyManager.recordAddConnections(wires);
          }
        }
        else if (e.code === 'Backspace') {
          if (connectTool.mode === ConnectMode.NtoN) historyManager.recordSelectionsClear(selectedTool, ['source', 'target']);
          else historyManager.recordConnectTargetsClear(connectTool.targets, connectTool.mode);
          const wires = disconnectSelected();
          historyManager.recordRemoveConnections(wires);
        }
      } else if (selectedTool === ToolMode.Paint) {
        if (e.code === 'Enter') {
          const { oldColors, newColor } = circuitIO.paintSelected(selectionSets['selection'], null);
          historyManager.recordChangeColor(oldColors, newColor);
        }
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
              circuitIO.paintSelected(selectionSets['selection'], color);
              drawingTimer.step();
            }
          })
        }
      }
    }
    drawingTimer.step();
  }


});
function switchToolAndMode(isUndo: boolean) {
  const action = isUndo ? historyManager.peekUndoAction() : historyManager.peekRedoAction();
  if (action === undefined) return;
  let desiredToolMode: ToolMode | undefined;
  let desiredToolConfig: ConnectMode | undefined;

  function configureForSelection(key: SelectionSets) {
    switch (key) {
      case 'selection':
        desiredToolMode = ToolMode.Cursor;
        break;
      case 'source':
      case 'target':
        desiredToolMode = ToolMode.Connect;
        desiredToolConfig = ConnectMode.NtoN;
        break;
    }
  }

  switch (action.type) {
    case 'SELECTION_CLICK_CHANGE':
    case 'SELECTION_CLICK_CLEAR':
      configureForSelection((action as HistoryAction<typeof action.type>).data.key);
      break;
    case 'SELECTIONS_CHANGE':
      for (const data of (action as HistoryAction<typeof action.type>).data) {
        if (data.removed.length > 0) {
          configureForSelection(data.key);
          break;
        }
      }
      break;
    case 'SELECTIONS_CLEAR':
      for (const data of (action as HistoryAction<typeof action.type>).data) {
        desiredToolMode = data.tool;
        break;
      }
      break;
    case 'CONNECT_TARGET_CHANGE':
    case 'CONNECT_TARGETS_CLEAR':
      desiredToolMode = ToolMode.Connect;
      desiredToolConfig = (action as HistoryAction<typeof action.type>).data.mode;
      break;

  }

  if (desiredToolMode === undefined) return;

  switch (desiredToolMode) {
    case ToolMode.Cursor: document.getElementById('tool-move')?.click(); break;
    case ToolMode.Paint: document.getElementById('tool-paint')?.click(); break;
    case ToolMode.Connect:
      document.getElementById('tool-connect')?.click();
      if (desiredToolConfig === undefined) break;
      updateConnectMode(desiredToolConfig);
      break;
  }
}
// Обновление кнопок инструментов
function updateToolButtons(pressedBtn?: HTMLElement) {
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.removeAttribute('active');
  });
  pressedBtn?.setAttribute('active', 'true');
}

function deleteElements() {
  if (selectionSets['selection'].size > 0) {
    const wires: LogicGates.Wire[] = [];
    for (const element of selectionSets['selection']) {
      wires.push(...circuit.removeWiresForElement(element));
    }
    selectionSets['selection'].forEach(el => circuit.deleteElement(el));

    historyManager.recordSelectionsClear(selectedTool, ['selection']);
    historyManager.recordRemoveElements([...selectionSets['selection']], wires);
    clearSelections(['selection']);
  }
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
  saveFMsToLS();
  saveCircuitToLS();
});
