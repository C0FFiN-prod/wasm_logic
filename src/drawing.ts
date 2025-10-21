import { gateModeToType, gateTypeToMode, gridSize, pathMap, ShowWiresMode, ToolMode, type Point } from "./consts";
import { LogicElement, LogicGate, isInputElement, isOutputElement } from "./logic";
import {
    camera, canvas,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, circuit, elementUnderCursor,
    showWiresMode
} from "./main";
import { hexToRgb, luminance, lightness, rgbToHex, worldToTranslatedScreen } from "./utils";

let ctx: CanvasRenderingContext2D;

export function initContext() {
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
}

function drawGrid() {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 / camera.zoom;

    const left = camera.x / camera.zoom;
    const top = camera.y / camera.zoom;
    const right = (camera.x + canvas.width) / camera.zoom;
    const bottom = (camera.y + canvas.height) / camera.zoom;

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

    ctx.translate(-camera.x, -camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    drawGrid();

    drawWires();

    // Draw elements
    for (const el of circuit.elements) {
        drawElement(el);
        let borderColor = "#555";
        if (selectedSources.has(el) && selectedTargets.has(el))
            borderColor = '#ff0';
        else if (selectedSources.has(el))
            borderColor = '#0f0';
        else if (selectedTargets.has(el))
            borderColor = '#f00';
        else if (selectedElements.has(el))
            borderColor = '#19f';
        drawBorder(el, borderColor);
    }

    if (elementUnderCursor) {
        for (const el of elementUnderCursor.inputs) {
            if (el === elementUnderCursor) continue;
            const { x, y } = worldToTranslatedScreen(camera, el.x, el.y);
            writeTextAt(x + gridSize * 0.55, y + gridSize * 0.55, gridSize * 0.5, "#0f0", "IN");
        }
        for (const el of elementUnderCursor.outputs) {
            if (el === elementUnderCursor) continue;
            const { x, y } = worldToTranslatedScreen(camera, el.x, el.y);
            writeTextAt(x + gridSize * 0.55, y + gridSize * 0.55, gridSize * 0.5, "#f00", "OUT");
        }
        const { x, y } = worldToTranslatedScreen(camera, elementUnderCursor.x, elementUnderCursor.y);
        if (elementUnderCursor.inputs.has(elementUnderCursor))
            writeTextAt(x + gridSize * 0.55, y + gridSize * 0.55, gridSize * 0.5, "#ff0", "SW");
        else
            writeTextAt(x + gridSize * 0.55, y + gridSize * 0.55, gridSize * 0.5, "#19f", "X");

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


}

function drawWires() {
    if (showWiresMode === ShowWiresMode.Always ||
        showWiresMode === ShowWiresMode.Connect && selectedTool === ToolMode.Connect) {
        // Draw wires
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.beginPath();

        for (const wire of circuit.wires.values()) {
            let start = worldToTranslatedScreen(camera, wire.src.x, wire.src.y);
            let end = worldToTranslatedScreen(camera, wire.dst.x, wire.dst.y);
            ctx.moveTo(start.x + gridSize, start.y + gridSize * .5);
            ctx.lineTo(end.x, end.y + gridSize * .5);

        }
        ctx.stroke();
    }

    // Draw temporary connections between selected sources and targets
    if (
        (
            showWiresMode === ShowWiresMode.Always ||
            (showWiresMode === ShowWiresMode.Connect ||
                showWiresMode === ShowWiresMode.Temporary) && selectedTool === ToolMode.Connect
        ) &&
        selectedSources.size > 0 && selectedTargets.size > 0) {
        ctx.strokeStyle = '#fa0';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.beginPath();
        for (const source of selectedSources) {
            for (const target of selectedTargets) {
                let start = worldToTranslatedScreen(camera, source.x, source.y);
                let end = worldToTranslatedScreen(camera, target.x, target.y);
                ctx.moveTo(start.x + gridSize, start.y + gridSize * .5);
                ctx.lineTo(end.x, end.y + gridSize * .5);
            }
        }
        ctx.stroke();
    }
}

function drawBorder(el: LogicElement, color: string | CanvasGradient | CanvasPattern) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1/camera.zoom;
    ctx.strokeRect(
        el.x * gridSize,
        el.y * gridSize,
        gridSize,
        gridSize
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
    
    const [r, g, b] = hexToRgb(el.color);
    let isLuminant = luminance(r, g, b) >= 0.5;
    let isBright = lightness(r, g, b) >= 0.5;
    const shiftedColor = rgbToHex(
        Math.floor(r * 0.5 + 63.75),
        Math.floor(g * 0.5 + 63.75),
        Math.floor(b * 0.5 + 63.75)
    );
    ctx.save();
    ctx.translate(wx, wy);
    ctx.strokeStyle = '#555';
    ctx.fillStyle = (el.value === isBright) ? el.color : shiftedColor;
    ctx.lineWidth = 1 / camera.zoom;
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
    if (camera.zoom > 0.65) {
        let path = pathMap.get((el.type == 'GATE' ? gateModeToType.get((el as LogicGate).gateType)! : el.type).toLowerCase());
        if (path)
            drawSvgSymbol(new Path2D(path), 5, 5, 10 / 22, (isLuminant ? rgbToHex(r - 127, g - 127, b - 127) : rgbToHex(r + 127, g + 127, b + 127)), 1);
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

function writeTextAt(x: number, y: number, fontSize: number, color: string, ...data: any[]) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = "black";   // цвет тени
    ctx.shadowBlur = 4;          // размытие
    ctx.shadowOffsetX = 0;       // смещение по X
    ctx.shadowOffsetY = 0;  // смещение по Y
    let str = "";
    for (const d of data) {
        str += d + ' ';
    }
    ctx.fillText(str, x, y);
    ctx.restore();
}