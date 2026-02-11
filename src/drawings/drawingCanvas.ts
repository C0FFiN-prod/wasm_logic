import { chunkSize, colors, ConnectMode, gateModeToType, gridSize, overlayColorIndexes, ShowWiresMode, textColors, texts, ToolMode, type ElementPDO, type Point, type vec3 } from "../consts";
import { LogicElement, LogicGate } from "../logic";
import {
    camera,
    isSelecting, selectionEnd, selectionStart,
    selectedElements,
    selectedTool, circuit, elementUnderCursor,
    showWiresMode,
    selectionColor,
    customOverlays,
    settings,
    ghostElements
} from "../main";
import { connectTool } from "../utils/connectionTool";
import { hexToRgb, luminance, lightness, rgbToHex, worldToTranslatedScreen, screenToWorld } from "../utils/utils";
import { wireDrawingAlg, overlayIconMap } from ".";

let ctx: CanvasRenderingContext2D;
let canvas: HTMLCanvasElement;
let frameCnt = 0;
export function initContext(_canvas: HTMLCanvasElement) {
    canvas = _canvas;
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
}

function drawGrid() {
    ctx.strokeStyle = rgbToHex(
        Math.trunc(colors.grid[0] * 255),
        Math.trunc(colors.grid[1] * 255),
        Math.trunc(colors.grid[2] * 255)
    );
    ctx.lineWidth = 1 / camera.zoom;

    const left = camera.x / camera.zoom;
    const top = camera.y / camera.zoom;
    const right = (camera.x + canvas.width) / camera.zoom;
    const bottom = (camera.y + canvas.height) / camera.zoom;

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;

    ctx.beginPath();
    for (let x = startX; x <= right; x += gridSize) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
    }

    for (let y = startY; y <= bottom; y += gridSize) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
    }
    ctx.stroke();
}

export function draw() {
    if (++frameCnt === 1000) {
        frameCnt = 0;
        colorMap.clear();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // ctx.fillStyle = rgbToHex(colors.background[0] * 255, colors.background[1] * 255, colors.background[2] * 255);
    // ctx.fillRect(0, 0, canvas.width, canvas.height);
    // canvas.style.backgroundColor = rgbToHex(colors.background[0] * 255, colors.background[1] * 255, colors.background[2] * 255);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(-camera.x, -camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    drawGrid();

    drawWires();

    const h = camera.zoom * gridSize;
    const cameraWorldX = camera.x / h - 1;
    const cameraWorldY = camera.y / h - 1;
    const { x: wx, y: wy } = screenToWorld(camera, canvas.width, canvas.height);

    const x0 = Math.floor(cameraWorldX / chunkSize);
    const y0 = Math.floor(cameraWorldY / chunkSize);
    const x1 = Math.floor(wx / chunkSize);
    const y1 = Math.floor(wy / chunkSize);
    const visibleChunks = [];

    for (let x = x0; x <= x1; ++x) {
        for (let y = y0; y <= y1; ++y) {
            const chunk = circuit.chunks.get(`${x}|${y}`);
            if (chunk && chunk.size > 0)
                visibleChunks.push(chunk);
        }
    }

    // Draw elements
    for (const chunk of visibleChunks) {
        for (const el of chunk) {
            drawElement(el);
        }
    }
    for (const el of ghostElements) {
        drawElement(el);
    }


    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (isSelecting) {
        ctx.strokeStyle = rgbToHex(
            Math.trunc(selectionColor[0] * 255),
            Math.trunc(selectionColor[1] * 255),
            Math.trunc(selectionColor[2] * 255)
        );
        ctx.lineWidth = 1.1;
        const x = Math.min(selectionStart.x, selectionEnd.x);
        const y = Math.min(selectionStart.y, selectionEnd.y);
        const w = Math.abs(selectionEnd.x - selectionStart.x);
        const h = Math.abs(selectionEnd.y - selectionStart.y);
        ctx.strokeRect(x, y, w, h);
    }
}
function drawLines(points: number[]) {
    const n = Math.trunc(points.length / 4);
    ctx.moveTo(points[0], points[1]);
    for (let i = 0; i < n; ++i) {
        ctx.lineTo(points[2 + i * 4], points[2 + i * 4 + 1]);
    }
}
function drawWires() {
    if (showWiresMode === ShowWiresMode.Always ||
        showWiresMode === ShowWiresMode.Connect && selectedTool === ToolMode.Connect) {
        // Draw wires
        ctx.strokeStyle = rgbToHex(
            Math.trunc(colors.wires[0] * 255),
            Math.trunc(colors.wires[1] * 255),
            Math.trunc(colors.wires[2] * 255)
        );
        ctx.lineWidth = 1 / camera.zoom;
        ctx.beginPath();

        for (const wire of circuit.wires.values()) {
            const start = worldToTranslatedScreen(camera, wire.src.x, wire.src.y);
            const end = worldToTranslatedScreen(camera, wire.dst.x, wire.dst.y);
            drawLines(wireDrawingAlg(start, end));
        }
        ctx.stroke();
    }

    // Draw temporary connections between selected sources and targets
    if (
        showWiresMode === ShowWiresMode.Always ||
        (showWiresMode === ShowWiresMode.Connect ||
            showWiresMode === ShowWiresMode.Temporary) && selectedTool === ToolMode.Connect
    ) {
        ctx.strokeStyle = rgbToHex(
            Math.trunc(colors.tempWires[0] * 255),
            Math.trunc(colors.tempWires[1] * 255),
            Math.trunc(colors.tempWires[2] * 255)
        );
        ctx.lineWidth = 1 / camera.zoom;
        if (connectTool.mode === ConnectMode.NtoN) {
            if (connectTool.sources[0].size === 0 || connectTool.sources[1].size === 0) return;
            ctx.beginPath();
            for (const source of connectTool.sources[0]) {
                for (const target of connectTool.sources[1]) {
                    const start = worldToTranslatedScreen(camera, source.x, source.y);
                    const end = worldToTranslatedScreen(camera, target.x, target.y);
                    drawLines(wireDrawingAlg(start, end));
                }
            }
            ctx.stroke();
        } else if (connectTool.mode === ConnectMode.Sequence) {
            if (connectTool.sources[0].size === 0) return;
            let prevEl: Point | null = null;
            ctx.beginPath();
            for (const el of connectTool.sources[0]) {
                if (prevEl !== null) {
                    const start = worldToTranslatedScreen(camera, prevEl.x, prevEl.y);
                    const end = worldToTranslatedScreen(camera, el.x, el.y);
                    drawLines(wireDrawingAlg(start, end));
                }
                prevEl = el;
            }
            ctx.stroke();
        } else if (connectTool.mode === ConnectMode.Parallel) {
            if (connectTool.sources[0].size === 0 || connectTool.sources[1].size === 0) return;
            const sources = connectTool.sources[0].values();
            const targets = connectTool.sources[1].values();
            let source, target;
            ctx.beginPath();
            while (
                (source = sources.next().value) !== undefined &&
                (target = targets.next().value) !== undefined
            ) {
                const start = worldToTranslatedScreen(camera, source.x, source.y);
                const end = worldToTranslatedScreen(camera, target.x, target.y);
                drawLines(wireDrawingAlg(start, end));
            }
            ctx.stroke();
        } else if (connectTool.mode === ConnectMode.Decoder) {
            if (connectTool.sources[0].size === 0 || connectTool.sources[1].size === 0 || connectTool.sources[2].size === 0) return;
            const positives = (connectTool.sources[0]).values();
            const negatives = (connectTool.sources[1]).values();
            const targets = (connectTool.sources[2]);
            let positive: Point | undefined;
            let negative: Point | undefined;
            let k = 1;
            ctx.beginPath();
            while (
                (positive = positives.next().value) !== undefined &&
                (negative = negatives.next().value) !== undefined
            ) {
                let j = k, flag = false, source = negative;
                for (const target of targets) {
                    const start = worldToTranslatedScreen(camera, source.x, source.y);
                    const end = worldToTranslatedScreen(camera, target.x, target.y);
                    drawLines(wireDrawingAlg(start, end));
                    if (--j === 0) {
                        flag = !flag;
                        source = flag ? positive : negative;
                        j = k;
                    }
                }
                k <<= 1;
            }
            ctx.stroke();
        } else return;
    }
}
const colorMap: Map<string, {
    fillV0: string,
    fillV1D0: string,
    fillV1D1: string,
    iconV0: string,
    iconV1: string,
    light: CanvasGradient
}> = new Map();

function addColorToColorMap(color: string) {
    if (colorMap.has(color)) return;
    let fillV0: string;
    let fillV1D0: string;
    let fillV1D1: string;
    let iconV0: string;
    let iconV1: string;
    let lightColor: string;
    const halv = gridSize * .5;
    const light = ctx.createRadialGradient(halv, halv, 0, halv, halv, gridSize * .75);
    light.addColorStop(0, "rgba(0, 0, 0, 0)");

    const [r, g, b] = hexToRgb(color);
    let isLuminant = luminance(r, g, b) >= 127;
    let isBright = lightness(r, g, b) >= 127;
    const [sR, sG, sB] = [
        Math.floor(r * 0.5 + 63.75),
        Math.floor(g * 0.5 + 63.75),
        Math.floor(b * 0.5 + 63.75)
    ]
    const L = ((isLuminant) ? -128 : 127);

    if (isBright) {
        fillV0 = rgbToHex(sR, sG, sB);
        fillV1D0 = rgbToHex(r + L, g + L, b + L);
        fillV1D1 = rgbToHex(r, g, b);
        iconV0 = rgbToHex(sR + L, sG + L, sB + L);
        iconV1 = rgbToHex(r + 2 * L, g + 2 * L, b + 2 * L);
        lightColor = `rgba(${r + L}, ${g + L}, ${b + L}, 0.9)`;
    }
    else {
        fillV0 = rgbToHex(r, g, b);
        fillV1D0 = rgbToHex(sR + L, sG + L, sB + L);
        fillV1D1 = rgbToHex(sR, sG, sB);
        iconV0 = rgbToHex(r + L, g + L, b + L);
        iconV1 = rgbToHex(sR + 2 * L, sG + 2 * L, sB + 2 * L);
        lightColor = `rgba(${sR + L}, ${sG + L}, ${sB + L}, 0.9)`;
    }
    light.addColorStop(0.5, lightColor);
    light.addColorStop(1, "rgba(0, 0, 0, 0)");
    colorMap.set(color, {
        fillV0,
        fillV1D0,
        fillV1D1,
        iconV0,
        iconV1,
        light
    });
}

function drawElement(el: LogicElement | ElementPDO) {
    const wx = el.x * gridSize;
    const wy = el.y * gridSize;

    addColorToColorMap(el.color);
    const elColors = colorMap.get(el.color)!;

    if (!el.value) ctx.fillStyle = elColors.fillV0;
    else ctx.fillStyle = (settings.drawIcons) ? elColors.fillV1D1 : elColors.fillV1D0;

    ctx.fillRect(wx, wy, gridSize, gridSize);

    if (settings.drawIcons) {
        let iconColor = elColors.iconV0;
        if (el.value) {
            ctx.fillStyle = elColors.light;
            ctx.fillRect(wx, wy, gridSize, gridSize);
            iconColor = elColors.iconV1;
        }
        let path;
        if (el instanceof LogicElement) {
            const type = (el.type == 'GATE' ? gateModeToType.get((el as LogicGate).gateType)! : el.type).toLowerCase();
            path = (activePathMap.has(type) && el.value) ? activePathMap.get(type) : pathMap.get(type);
        } else {
            path = pathMap.get(el.icon)!;
        }
        if (path) drawSvgSymbol(new Path2D(path), wx + 1, wy + 1, 0.75, null, 0, iconColor);
    }

    let border = 0;
    let iconOverlayIndex = 0;
    let iconOverlayColor = 0;
    if (el instanceof LogicElement) {
        if (customOverlays.has(el)) {
            const { icon, color } = customOverlays.get(el)!;
            iconOverlayIndex = overlayIconMap.get(icon)!;
            iconOverlayColor = color;
        } else if (elementUnderCursor) {
            if (elementUnderCursor.inputs.has(el) && elementUnderCursor === el) {
                iconOverlayIndex = overlayIconMap.get('sw')!;
            } else if (elementUnderCursor == el) {
                iconOverlayIndex = overlayIconMap.get('x')!;
            } else if (elementUnderCursor.inputs.has(el) && elementUnderCursor.outputs.has(el)) {
                iconOverlayIndex = overlayIconMap.get('vv')!;
            } else if (elementUnderCursor.inputs.has(el)) {
                iconOverlayIndex = overlayIconMap.get('in')!;
            } else if (elementUnderCursor.outputs.has(el)) {
                iconOverlayIndex = overlayIconMap.get('out')!;
            }
            iconOverlayColor = overlayColorIndexes[iconOverlayIndex] || 0;
        }

        if (connectTool.sources[2].has(el) || selectedElements.has(el))
            border = selectedTool === ToolMode.Cursor ? 1 : 5;
        else if (connectTool.sources[1].has(el) && connectTool.sources[0].has(el))
            border = 4;
        else if (connectTool.sources[0].has(el))
            border = 2;
        else if (connectTool.sources[1].has(el))
            border = 3;

    } else {
        iconOverlayIndex = overlayIconMap.get(el.overlay)!;
        iconOverlayColor = el.overlayColor;
        border = el.borderColor;
    }
    ctx.strokeStyle = textColors[border];
    ctx.lineWidth = 1 / camera.zoom;
    ctx.strokeRect(wx, wy, gridSize, gridSize);
    if (iconOverlayIndex !== 0)
        writeTextAt(wx + gridSize * 0.55, wy + gridSize * 0.55, gridSize * 0.5, textColors[iconOverlayColor], texts[iconOverlayIndex - 1]);
}

function drawSvgSymbol(
    path: Path2D,
    centerX: number,
    centerY: number,
    size: number,
    strokeColor: string | null = 'black',
    strokeWidth = 1,
    fillColor: string | null = null
) {
    ctx.save();

    ctx.translate(centerX, centerY);
    ctx.scale(size, size);

    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill(path);
    }
    if (strokeColor) {
        ctx.lineWidth = strokeWidth / size;
        ctx.strokeStyle = strokeColor;
        ctx.stroke(path);
    }

    ctx.restore();
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

const pathMap = new Map<string, string>(Object.entries(
    {
        "output": "M21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12ZM24 12C24 18.6274 18.6274 24 12 24C5.37258 24 -2.38419e-07 18.6274 0 12C7.5384e-07 5.37258 5.37258 -2.38419e-07 12 0C18.6274 7.5384e-07 24 5.37258 24 12Z",
        "switch": "M21 12C21 7.54059 17.7564 3.8402 13.5 3.12598V20.8726C17.7563 20.1582 21 16.4593 21 12ZM3 12C3 16.4593 6.24367 20.1582 10.5 20.8726V3.12598C6.24355 3.8402 3 7.54059 3 12ZM24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12C3.81281e-08 5.37258 5.37258 3.81269e-08 12 0C18.6274 0 24 5.37258 24 12Z",
        "button": "M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21ZM12 14.9995C13.6566 14.9995 14.9995 13.6566 14.9995 12C14.9995 10.3434 13.6566 9.00053 12 9.00053C10.3434 9.00053 9.00053 10.3434 9.00053 12C9.00053 13.6566 10.3434 14.9995 12 14.9995ZM12 17.9995C8.68658 17.9995 6.00053 15.3134 6.00053 12C6.00053 8.68658 8.68658 6.00053 12 6.00053C15.3134 6.00053 17.9995 8.68658 17.9995 12C17.9995 15.3134 15.3134 17.9995 12 17.9995ZM12 24C5.37258 24 -8.1423e-07 18.6274 -5.24537e-07 12C2.00044e-07 5.37258 5.37258 -7.17592e-07 12 -5.24537e-07C18.6274 -2.34843e-07 24 5.37258 24 12C24 18.6274 18.6274 24 12 24Z",
        "timer": "M22.4428 0L22.6904 0.019043C23.8791 0.203321 24.4199 1.70045 23.521 2.6001L14.1211 12L23.521 21.3999C24.4801 22.3597 23.7998 24 22.4428 24H1.55709C0.200049 24 -0.480058 22.3597 0.478964 21.3999L9.87887 12L0.478964 2.6001C-0.480058 1.64033 0.200049 0 1.55709 0H22.4428ZM5.12105 21H18.8789L12 14.1211L5.12105 21ZM12 9.87891L18.8789 3H5.12105L12 9.87891Z",
        "t_flop": "M10.7551 0.673786C11.3959 -0.247054 12.8362 -0.181122 13.3625 0.87154L23.8245 21.7954C24.3309 22.8082 23.5947 24 22.4622 24H1.53832C0.40583 24 -0.330448 22.8083 0.17602 21.7954L10.6379 0.87154L10.7551 0.673786ZM3.92749 21H20.073L12.0002 4.85445L3.92749 21Z",
        "xnor": "M12 15.6006C10.0638 15.6006 7.66301 16.3446 5.63525 17.1694C4.64503 17.5722 3.78669 17.9757 3.17725 18.2783C3.1152 18.3091 3.05665 18.3406 3 18.3691V20.0845C3.52934 19.8426 4.12924 19.5777 4.77832 19.3198C6.84169 18.5 9.55948 17.6396 12 17.6396C14.4405 17.6396 17.1583 18.5 19.2217 19.3198C19.8708 19.5777 20.4707 19.8426 21 20.0845V18.3691C20.9433 18.3406 20.8848 18.3091 20.8228 18.2783C20.2133 17.9757 19.355 17.5722 18.3647 17.1694C16.337 16.3446 13.9362 15.6006 12 15.6006ZM15.7397 6.56104C14.9822 7.8396 13.5939 8.69971 12 8.69971C10.4059 8.69971 9.01626 7.83996 8.25879 6.56104C5.46572 8.44005 3.46407 11.676 3.07031 15.0088C3.50537 14.811 3.98777 14.6008 4.50439 14.3906C6.60666 13.5355 9.45633 12.6006 12 12.6006C14.5437 12.6006 17.3933 13.5355 19.4956 14.3906C20.0118 14.6006 20.4935 14.8112 20.9282 15.0088C20.5344 11.6757 18.5333 8.43991 15.7397 6.56104ZM12 3C11.2544 3 10.6494 3.605 10.6494 4.35059C10.6497 5.0959 11.2546 5.69971 12 5.69971C12.7454 5.69971 13.3503 5.0959 13.3506 4.35059C13.3506 3.605 12.7456 3 12 3ZM24 22.4604C23.9999 22.8906 23.8137 23.3549 23.4067 23.6689C22.9497 24.0215 22.3005 24.1016 21.7471 23.7979C21.5405 23.6844 20.0552 22.8807 18.1128 22.1089C16.1326 21.3221 13.8514 20.6396 12 20.6396C10.1486 20.6396 7.86739 21.3221 5.88721 22.1089C3.94484 22.8807 2.45955 23.6844 2.25293 23.7979C1.69952 24.1016 1.05027 24.0215 0.593262 23.6689C0.237198 23.3942 0.0500878 23.0043 0.00878906 22.623L0 22.4604V16.1997L0.0102539 15.6855C0.21075 10.6575 3.32584 5.73098 7.7666 3.36182C8.21439 1.43587 9.93778 -1.71456e-07 12 0C14.0621 2.58761e-07 15.784 1.43604 16.2319 3.36182C20.8246 5.81144 23.9999 10.9958 24 16.1997V22.4604Z",
        "nor": "M12 3C11.2537 3 10.6498 3.60426 10.6494 4.35059C10.6517 5.09659 11.2551 5.69912 12.0015 5.69971C12.747 5.70014 13.3526 5.0984 13.3564 4.35352L13.3491 4.21436C13.2783 3.53219 12.7005 3 12 3ZM21 15.0278C20.9999 11.3129 19.0214 8.07576 15.8394 6.3999C15.105 7.76941 13.6612 8.70102 11.9985 8.69971C10.338 8.69829 8.89657 7.76776 8.16357 6.3999C4.98088 8.07474 3.0001 11.3134 3 15.0278V20.187C3.53957 19.9637 4.15494 19.7174 4.82227 19.478C6.88599 18.7379 9.58651 17.9678 12 17.9678C14.4135 17.9678 17.114 18.7379 19.1777 19.478C19.8451 19.7174 20.4604 19.9637 21 20.187V15.0278ZM24 22.4619C24 22.8812 23.8224 23.3393 23.4258 23.6558C22.9828 24.0089 22.3525 24.1011 21.8027 23.8286C21.5958 23.7261 20.1097 23.0001 18.1641 22.3022C16.183 21.5917 13.8809 20.9678 12 20.9678C10.1191 20.9678 7.81703 21.5917 5.83594 22.3022C3.89028 23.0001 2.40421 23.7261 2.19727 23.8286C1.64745 24.1011 1.0172 24.0089 0.574219 23.6558C0.177568 23.3393 0 22.8812 0 22.4619V15.0278C0.000113786 9.80129 3.04211 5.25778 7.79004 3.26221C8.27377 1.38635 9.97305 -1.68582e-07 12 0C14.0267 2.54315e-07 15.7256 1.3865 16.2114 3.26221C20.9598 5.25915 23.9999 9.80038 24 15.0278V22.4619Z",
        "nand": "M12 3C11.2544 3 10.6494 3.605 10.6494 4.35059C10.6497 5.0959 11.2546 5.69971 12 5.69971C12.7454 5.69971 13.3503 5.0959 13.3506 4.35059C13.3506 4.24919 13.2511 3.88026 12.9053 3.49951C12.5775 3.13886 12.2397 3 12 3ZM21 15.6006C21 11.6983 19.0572 8.34737 15.7969 6.46729C15.053 7.79834 13.6331 8.69971 12 8.69971C10.3666 8.69971 8.9454 7.79868 8.20166 6.46729C4.94204 8.34749 3 11.6987 3 15.6006V21H21V15.6006ZM24 22.4766C24 23.318 23.3179 24 22.4766 24H1.52344C0.68206 24 3.70796e-08 23.3179 0 22.4766V15.6006C0 10.2013 2.96133 5.56354 7.77979 3.30908C8.24665 1.40983 9.95671 -1.69882e-07 12 0C13.3343 1.67438e-07 14.4222 0.706558 15.126 1.48096C15.5792 1.97967 15.9631 2.61244 16.1748 3.28857C21.0199 5.53513 24 10.1844 24 15.6006V22.4766Z",
        "xor": "M12 15.6006C10.0638 15.6006 7.66301 16.3446 5.63525 17.1694C4.64503 17.5722 3.78669 17.9757 3.17725 18.2783C3.1152 18.3091 3.05665 18.3406 3 18.3691V20.0845C3.52934 19.8426 4.12924 19.5777 4.77832 19.3198C6.84169 18.5 9.55948 17.6396 12 17.6396C14.4405 17.6396 17.1583 18.5 19.2217 19.3198C19.8708 19.5777 20.4707 19.8426 21 20.0845V18.3691C20.9433 18.3406 20.8848 18.3091 20.8228 18.2783C20.2133 17.9757 19.355 17.5722 18.3647 17.1694C16.337 16.3446 13.9362 15.6006 12 15.6006ZM21 14.1006C21 11.698 19.6425 8.8843 17.6631 6.60938C16.6908 5.49195 15.6194 4.56546 14.5898 3.92871C13.5386 3.27857 12.6445 3 12 3C11.3555 3 10.4614 3.27857 9.41016 3.92871C8.38065 4.56546 7.30925 5.49195 6.33691 6.60938C4.35748 8.8843 3 11.698 3 14.1006V15.041C3.45318 14.834 3.95974 14.6122 4.50439 14.3906C6.60666 13.5355 9.45633 12.6006 12 12.6006C14.5437 12.6006 17.3933 13.5355 19.4956 14.3906C20.0403 14.6122 20.5468 14.834 21 15.041V14.1006ZM24 22.4604C23.9999 22.8906 23.8137 23.3549 23.4067 23.6689C22.9497 24.0215 22.3005 24.1016 21.7471 23.7979C21.5405 23.6844 20.0552 22.8807 18.1128 22.1089C16.1326 21.3221 13.8514 20.6396 12 20.6396C10.1486 20.6396 7.86739 21.3221 5.88721 22.1089C3.94484 22.8807 2.45955 23.6844 2.25293 23.7979C1.69952 24.1016 1.05027 24.0215 0.593262 23.6689C0.186314 23.3549 0.000107082 22.8906 0 22.4604V14.1006C0 10.7042 1.83292 7.21595 4.07373 4.64062C5.21136 3.33318 6.50731 2.19654 7.83252 1.37695C9.13615 0.570734 10.585 1.20312e-08 12 0C13.415 0 14.8638 0.570734 16.1675 1.37695C17.4927 2.19654 18.7886 3.33318 19.9263 4.64062C22.1671 7.21595 24 10.7042 24 14.1006V22.4604Z",
        "or": "M21 14.6631C21 12.2461 19.6301 9.28381 17.6367 6.85986C16.6576 5.66933 15.5802 4.67574 14.5488 3.9917C13.4918 3.29064 12.6137 3 12 3C11.3863 3 10.5082 3.29064 9.45117 3.9917C8.41982 4.67574 7.3424 5.66933 6.36328 6.85986C4.36995 9.28381 3 12.2461 3 14.6631V20.2573C3.54701 20.0479 4.17498 19.8162 4.85596 19.5908C6.91925 18.9079 9.60613 18.2021 12 18.2021C14.3939 18.2021 17.0808 18.9079 19.144 19.5908C19.825 19.8162 20.453 20.0479 21 20.2573V14.6631ZM24 22.4634C24 22.8748 23.8291 23.3276 23.4404 23.6455C23.0081 23.9989 22.393 24.1003 21.8467 23.8506C21.6435 23.7577 20.1539 23.086 18.2021 22.4399C16.2198 21.7838 13.9021 21.2022 12 21.2022C10.0979 21.2022 7.78022 21.7838 5.79785 22.4399C3.84611 23.086 2.35647 23.7577 2.15332 23.8506C1.60703 24.1003 0.991906 23.9989 0.55957 23.6455C0.170862 23.3276 3.16063e-05 22.8748 0 22.4634V14.6631C0 11.2813 1.8207 7.66156 4.04736 4.9541C5.17835 3.57892 6.46944 2.36903 7.79297 1.49121C9.09076 0.630497 10.5543 0 12 0C13.4457 0 14.9092 0.630497 16.207 1.49121C17.5306 2.36903 18.8216 3.57892 19.9526 4.9541C22.1793 7.66156 24 11.2813 24 14.6631V22.4634Z",
        "and": "M21 12.7969C21 7.50713 16.8571 3.04688 12 3.04688C7.14287 3.04688 3 7.50713 3 12.7969V21.0938H21V12.7969ZM24 22.5703C24 23.4117 23.3179 24.0937 22.4766 24.0938H1.52344C0.734462 24.0938 0.0850907 23.494 0.00732422 22.7256L0 22.5703V12.7969C0 6.08662 5.25915 0.046875 12 0.046875C18.7408 0.046875 24 6.08662 24 12.7969V22.5703Z",
    }
));
const activePathMap = new Map<string, string>(Object.entries({
    "output": "M12 24C5.37259 24 2.97033e-05 18.6274 2.9993e-05 12C3.07176e-05 5.37258 5.37259 -7.17591e-07 12 -5.24536e-07C18.6274 -2.34843e-07 24 5.37258 24 12C24 18.6274 18.6274 24 12 24Z",
    "switch": "M12 21C16.4594 21 20.1598 17.7564 20.874 13.5L3.12744 13.5C3.84176 17.7563 7.54068 21 12 21ZM12 3C7.54068 3 3.84176 6.24367 3.12744 10.5L20.874 10.5C20.1598 6.24355 16.4594 3 12 3ZM12 24C5.37258 24 -8.1423e-07 18.6274 -5.24537e-07 12C-1.96715e-07 5.37258 5.37258 -8.1423e-07 12 -5.24537e-07C18.6274 -1.96715e-07 24 5.37258 24 12C24 18.6274 18.6274 24 12 24Z",
    "button": "M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21ZM12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM12 24C5.37258 24 -8.1423e-07 18.6274 -5.24537e-07 12C2.00044e-07 5.37258 5.37258 -7.17592e-07 12 -5.24537e-07C18.6274 -2.34843e-07 24 5.37258 24 12C24 18.6274 18.6274 24 12 24Z",
}));