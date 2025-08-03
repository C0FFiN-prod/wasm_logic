import { pathMap } from "./icons";
import { LogicElement, isInputElement, isOutputElement } from "./logic";
import {
    camera, canvas, gridSize,
    worldToTranslatedScreen, worldToScreen,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, circuit,
    type Point
} from "./main";

let ctx: CanvasRenderingContext2D;

export function initContext() {
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
}

function drawGrid() {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 / camera.zoom;

    const left = camera.x;
    const top = camera.y;
    const right = camera.x + canvas.width / camera.zoom;
    const bottom = camera.y + canvas.height / camera.zoom;

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;

    for (let x = startX; x <= right; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
    }

    for (let y = startY; y <= bottom; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
    }
}

export function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);

    drawGrid();

    if (selectedTool === 'connect') {
        // Draw wires
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (const wire of circuit.wires.values()) {
            let start = worldToTranslatedScreen(wire.from.x, wire.from.y);
            let end = worldToTranslatedScreen(wire.to.x, wire.to.y);
            ctx.moveTo(start.x + gridSize, start.y + gridSize * .5);
            ctx.lineTo(end.x, end.y + gridSize * .5);

        }
        ctx.stroke();

        // Draw temporary connections between selected sources and targets
        if (selectedSources.length > 0 && selectedTargets.length > 0) {
            ctx.strokeStyle = '#fa0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (const source of selectedSources) {
                for (const target of selectedTargets) {
                    let start = worldToTranslatedScreen(source.x, source.y);
                    let end = worldToTranslatedScreen(target.x, target.y);
                    ctx.moveTo(start.x + gridSize, start.y + gridSize * .5);
                    ctx.lineTo(end.x, end.y + gridSize * .5);
                }
            }
            ctx.stroke();
        }
    }

    // Draw elements
    for (const el of circuit.elements) {
        drawElement(el);
    }

    // Highlight selected sources (green)
    ctx.lineWidth = 3;
    for (const el of selectedSources) {
        drawBorder(el, '#0f0');
    }

    // Highlight selected targets (red)
    for (const el of selectedTargets) {
        drawBorder(el, '#f00');
    }

    // Highlight selected elements (blue)
    for (const el of selectedElements) {
        drawBorder(el, '#19f');
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (isSelecting) {
        ctx.strokeStyle = '#19f';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const w = Math.abs(selectionEnd.x - selectionStart.x);
        const h = Math.abs(selectionEnd.y - selectionStart.y);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    drawPoint(worldToScreen(0, 0), "#f00");
    drawPoint({ x: canvas.width / 2, y: canvas.height / 2 }, "#0f0");

}

function drawBorder(el: LogicElement, color: string | CanvasGradient | CanvasPattern) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(
        el.x * gridSize - 2,
        el.y * gridSize - 2,
        gridSize + 4,
        gridSize + 4
    );
}



function drawElement(el: LogicElement) {
    // Округляем экранные координаты для четкой отрисовки 
    // if ((0 < start_x && start_x < canvas.width) ||
    //     (0 < end_x && end_x < canvas.width) ||
    //     (0 < start_y && start_y < canvas.height) ||
    //     (0 < end_y && end_y < canvas.height)
    // ) {
    const wx = el.x * gridSize;
    const wy = el.y * gridSize;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.strokeStyle = '#555';
    ctx.fillStyle = el.value ? '#15c' : '#333';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.beginPath();
    ctx.rect(0, 0, gridSize, gridSize);
    ctx.fill();
    ctx.stroke();

    if (el.value) {
        ctx.beginPath();
        ctx.arc(gridSize * .5, gridSize * .5, 5, 0, 2 * Math.PI);
        if (el.type === 'OUTPUT')
            ctx.fillStyle = '#aa0';
        if (el.type === 'BUTTON' || el.type === 'SWITCH') {
            ctx.fillStyle = '#0c0';
        }

        ctx.fill();
        ctx.stroke();
    }
    let path = pathMap.get(el.type.toLowerCase());
    if (path)
        drawSvgSymbol(path, 5, 5, 10 / 22, (el.value ? '#59f' : '#eee'), 1);
    if (selectedTool === 'connect') {
        // Вход
        if (!isInputElement(el)) {
            ctx.beginPath();
            ctx.arc(0, gridSize * .5, 2, 0, 2 * Math.PI);
            ctx.fillStyle = el.value ? '#0a0' : '#aaa';
            ctx.fill();
            ctx.stroke();
        }

        // Выход
        else if (!isOutputElement(el)) {
            ctx.beginPath();
            ctx.arc(gridSize, gridSize * .5, 2, 0, 2 * Math.PI);
            ctx.fillStyle = el.value ? '#0a0' : '#aaa';
            ctx.fill();
            ctx.stroke();
        }
    }





    ctx.restore();
    // }

}

function drawSvgSymbol(path: Path2D, centerX: number, centerY: number, size: number, strokeColor = 'black', strokeWidth = 1, fillColor = null) {
    ctx.save();

    ctx.translate(centerX, centerY);
    ctx.scale(size, size); // масштаб символа (нормируется к 1)

    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill(path);
    }

    ctx.lineWidth = strokeWidth / size; // нормализуем толщину к масштабу
    ctx.strokeStyle = strokeColor;
    ctx.stroke(path);

    ctx.restore();
}


function drawPoint(point: Point, color: string) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.fill();
    ctx.stroke();
}

function drawCell(point: Point, color: string) {
    ctx.beginPath();
    ctx.rect(point.x, point.y, gridSize, gridSize);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.fill();
    ctx.stroke();
}

function writeTextAt(x: number, y: number, fontSize: number, ...data: any[]) {
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = `${fontSize}px sans-serif`;
    let str = "";
    for (const d of data) {
        str += d + ' ';
    }
    ctx.fillText(str, x, y);
    ctx.restore();
}