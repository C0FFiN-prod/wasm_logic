// main.js
var LogicGate = window.LogicGates.LogicGate;
var TFlop = window.LogicGates.TFlop;
var Timer = window.LogicGates.Timer;
var Button = window.LogicGates.Button;
var Switch = window.LogicGates.Switch;
var OutputElement = window.LogicGates.OutputElement;
var Circuit = window.LogicGates.Circuit;
const camera = { x: 0, y: 0, zoom: 1 };
const canvas = document.getElementById('circuit-canvas');
const ctx = canvas.getContext('2d');
const circuit = new Circuit();
const gridSize = 20;
let selectedTool = 'move'; // 'move' или 'connect'
let isSimulating = false;
let simInterval = null;
let prevMouseWorld = { x: 0, y: 0 };
let prevMousePos = { x: 0, y: 0 };
let selectedSources = [];
let selectedTargets = [];
let mouseX = 0;
let mouseY = 0;
let isHandMoving = false;
let isSelecting = false;
let isDragging = false;
let selectionStart = { x: 0, y: 0 };
let selectionEnd = { x: 0, y: 0 };
let selectedElements = new Set();

// === Вспомогательные ===

function screenToWorld(sx, sy) {
    const h = camera.zoom * gridSize;
    return {
        x: (camera.x * camera.zoom + sx) / h,
        y: (camera.y * camera.zoom + sy) / h
    };
}

function worldToTranslatedScreen(wx, wy) {
    return {
        x: wx * gridSize,
        y: wy * gridSize
    };
}

function worldToScreen(wx, wy) {
    const h = camera.zoom * gridSize;
    return {
        x: wx * h - camera.x * camera.zoom,
        y: wy * h - camera.y * camera.zoom
    };
}
window.onload = (() => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - document.querySelector('header').offsetHeight;
    draw();
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - document.querySelector('header').offsetHeight;
    draw();
});
// Оптимизация симуляции
function optimizedStep() {
    circuit.step();
    requestAnimationFrame(draw);
}


function addElement(type, x, y) {
    let el;
    // Переводим координаты центра экрана в мировые координаты через screenToWorld
    const center = screenToWorld(canvas.width / 2, canvas.height / 2);
    const worldX = x || Math.round(center.x + Math.random() * 10 - 5);
    const worldY = y || Math.round(center.y + Math.random() * 10 - 5);
    const gateType = {
        'AND': 0,
        'OR': 1,
        'XOR': 2,
        'NAND': 3,
        'NOR': 4,
        'XNOR': 5,
    };
    switch (type) {
        case 'AND':
        case 'OR':
        case 'XOR':
        case 'NAND':
        case 'NOR':
        case 'XNOR':
            el = new LogicGate(gateType[type], worldX, worldY);
            break;
        case 'T-FLOP':
            el = new TFlop(worldX, worldY);
            break;
        case 'TIMER':
            el = new Timer(worldX, worldY);
            break;
        case 'BUTTON':
            el = new Button(worldX, worldY);
            break;
        case 'SWITCH':
            el = new Switch(worldX, worldY);
            break;
        case 'OUTPUT':
            el = new OutputElement(worldX, worldY);
            break;
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

function getElementsInRect(rect) {
    const selected = new Set();
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

function getElementAt(screenX, screenY) {
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


function isOutputElement(el) {
    return el && el.type !== 'OUTPUT';
}

function isInputElement(el) {
    return el && el.type !== 'INPUT';
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
    dragElements = [];
}

function connectSelected() {
    if (selectedSources.length === 0 || selectedTargets.length === 0) return;

    // Создаем новые связи
    for (const source of selectedSources) {
        for (const target of selectedTargets) {
            if (source !== target && isOutputElement(source) && isInputElement(target)) {
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
    if (e.button === 1) {
        prevMousePos.x = mouseX;
        prevMousePos.y = mouseY;
        isHandMoving = true;
    } else {
        const el = getElementAt(mouseX, mouseY);
        if (el) {
            if (selectedTool === 'connect') {
                if (e.button === 0) {
                    const index = selectedSources.indexOf(el);
                    if (index === -1 && isOutputElement(el)) {
                        selectedSources.push(el);
                    } else {
                        selectedSources.splice(index, 1);
                    }
                }
                else if (e.button === 2) {
                    const index = selectedTargets.indexOf(el);
                    if (index === -1 && isInputElement(el)) {
                        selectedTargets.push(el);
                    } else {
                        selectedTargets.splice(index, 1);
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
                    if (el.type == 'SWITCH') {
                        el.setValue(!el.value);
                    } else if (el.type == 'BUTTON') {
                        el.setValue(true);
                    } else if (el.type === 'TIMER') {
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
                console.log(e.clientY - canvas.getBoundingClientRect().top, e.offsetY)
                if (!e.shiftKey) {
                    clearSelection();
                }
            }
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
window.addEventListener('mouseup', e => {
    if (isSelecting || isDragging) {
        isSelecting = false;
        isDragging = false;
        draw();
    }
})
canvas.addEventListener('mouseout', e => {
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

document.addEventListener('keyup', e => {
    if (e.key === 'Shift') {
        multipleSelectionMode = false;
    }
});

// Обновление кнопок инструментов
function updateToolButtons() {
    document.querySelectorAll('#toolbar .tool-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tool-${selectedTool}`).classList.add('active');
}

// Toolbar buttons
['add-and', 'add-or', 'add-xor', 'add-nand', 'add-nor', 'add-xnor', 'add-t-flop', 'add-timer', 'add-button', 'add-switch', 'add-output'].forEach(id => {

    document.getElementById(id).onclick = () => {
        const type = id.replace('add-', '').toUpperCase();
        addElement(type);
        draw();
    };

});

document.getElementById('tool-move').onclick = () => {
    selectedTool = 'move';
    clearSelection();
    updateToolButtons();
    draw();
};

document.getElementById('tool-connect').onclick = () => {
    selectedTool = 'connect';
    clearSelection();
    updateToolButtons();
    draw();
};

document.getElementById('clear-canvas').onclick = clearCanvas;

document.getElementById('start-sim').onclick = () => {
    if (!isSimulating) {
        isSimulating = true;
        simInterval = setInterval(optimizedStep, 25);
    }
};

document.getElementById('step-sim').onclick = () => {
    isSimulating = false;
    clearInterval(simInterval);
    optimizedStep();
};

document.getElementById('stop-sim').onclick = () => {
    isSimulating = false;
    clearInterval(simInterval);
};

document.getElementById('save-scheme').onclick = () => {
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
};

document.getElementById('load-scheme').onclick = () => {
    document.getElementById('file-input').click();
};

document.getElementById('file-input').onchange = e => {
    const file = e.target.files[0];
    if (!file)
        return;
    const reader = new FileReader();
    reader.onload = evt => {
        const data = JSON.parse(evt.target.result);
        deserializeCircuit(data);
        draw();
    };
    reader.readAsText(file);
};

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
            value: el.value,
            state: el.state || false
        })),
        wires: Array.from(circuit.wires.values().map(w => ({
            from: w.from.id,
            to: w.to.id
        })))
    };
}

function deserializeCircuit(data) {
    circuit.elements = [];
    circuit.wires.clear();
    const idMap = {};
    for (const el of data.elements) {
        let obj = addElement(el.type, el.x, el.y);
        obj.id = el.id;
        idMap[el.id] = obj;
    }
    for (const w of data.wires) {
        const from = idMap[w.from];
        const to = idMap[w.to];
        if (from && to) {
            circuit.addWire(from, to);
        }
    }
}

// Инициализация
updateToolButtons();
draw();