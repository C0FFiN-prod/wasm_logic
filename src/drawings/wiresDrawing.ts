import { colors, ConnectMode, gridSize, ShowWiresMode, ToolMode, WireDrawings, type Camera, type Point, type Rect, type vec4 } from "../consts";
import { camera, circuit, isDragging, selectedTool, settings, showWiresMode } from "../main";
import { connectTool } from "../utils/connectionTool";
import { pointInRect, segment90LIntersectsRect, segment90SIntersectsRect, segmentAsideRect, segmentIntersectsRect } from "../utils/geometry";
import { cameraWorldViewportRect, worldToScreen } from "../utils/utils";
import { clipSegmentToRect } from "../utils/geometry";

export interface IWireRenderer {
    setup(color: vec4): void;
    finalize(start: number, end: number): void;
}
const oldParams = {
    camera: { x: 0, y: 0, zoom: 1 } as Camera,
    mode: 'simple' as WireDrawings,
    wiresCount: 0,
    showWiresMode: ShowWiresMode.None as ShowWiresMode,
    tool: 0 as ToolMode,
}
export let buffer = new Float16Array(1_000_000);
let offset = 0;
let permamentEnd = 0;

export let resized = false;

const segment: vec4 = [0, 0, 0, 0];
const rect: vec4 = [0, 0, 0, 0];
const maxNumber = 30000;
const MAX_TEMP_WIRES = 2048;
let h = gridSize;
let HALF = gridSize * 0.5;
let QUARTER = gridSize * 0.25;
let ONE_Q = gridSize * 1.25;
let ONE_H = gridSize * 1.5;
let mode: WireDrawings = 'simple';

function isClampNeeded(x0: number, y0: number, x1: number, y1: number) {
    return Math.abs(x0) > maxNumber
        || Math.abs(y0) > maxNumber
        || Math.abs(x1) > maxNumber
        || Math.abs(y1) > maxNumber
}

function reset() { offset = 0; resized = false; }

function writeWire(source: Point, target: Point) {
    const sameY = source.y === target.y;

    const src = worldToScreen(camera, source.x, source.y);
    const dst = worldToScreen(camera, target.x, target.y);

    const sx = src.x + h;
    const sy = src.y + HALF;
    const dx = dst.x;
    const dy = dst.y + HALF;

    if (offset > buffer.length - 100) resize(buffer.length + 100);

    const isBack = target.x - 1 <= source.x;

    if (mode === "simple" || sameY && target.x >= source.x) {
        clipAndWritePair(sx, sy, dx, dy, rect);
        return;
    }

    if (sameY) {
        const mx = src.x + ONE_Q;
        const nx = dst.x - QUARTER;
        const hy = src.y - HALF;

        writePair(sx, sy, mx, sy);
        writePair(mx, sy, mx, hy);
        clipAndWritePair(mx, hy, nx, hy, rect);
        writePair(nx, hy, nx, dy);
        writePair(nx, dy, dx, dy);
        return;
    }

    if (mode === "dimple") {
        if (isBack) {
            const s = Math.sign(target.y - source.y) * HALF;
            const mx = src.x + ONE_Q;
            const my = src.y + HALF + s;
            const nx = dst.x - QUARTER;
            const ny = dst.y + HALF - s;

            writePair(sx, sy, mx, sy);
            writePair(mx, sy, mx, my);
            clipAndWritePair(mx, my, nx, ny, rect);
            writePair(nx, ny, nx, dy);
            writePair(nx, dy, dx, dy);
        } else {
            const mx = src.x + ONE_H;
            const nx = dst.x - HALF;

            writePair(sx, sy, mx, sy);
            clipAndWritePair(mx, sy, nx, dy, rect);
            writePair(nx, dy, dx, dy);
        }
        return;
    }

    // manhattan
    if (isBack) {
        const diff = Math.abs(target.y - source.y);
        const yStep = Math.sign(target.y - source.y) * (diff > 1 ? h : HALF);
        const yMid = sy + yStep;
        const mx = sx + HALF;
        const nx = dx - HALF;

        writePair(sx, sy, mx, sy);
        writePair(mx, sy, mx, yMid);
        clipAndWritePair(mx, yMid, nx, yMid, rect);
        clipAndWritePair(nx, yMid, nx, dy, rect);
        writePair(nx, yMid, nx, dy);
        writePair(nx, dy, dx, dy);
        return;
    }

    // manhattan forward
    const midX = sx + HALF;// + Math.round((dx - sx - HALF) * 0.5 / (10 * h)) * (10 * h);
    clipAndWritePair(sx, sy, midX, sy, rect);
    clipAndWritePair(midX, sy, midX, dy, rect);
    clipAndWritePair(midX, dy, dx, dy, rect);
}

function clipAndWritePair(x1: number, y1: number, x2: number, y2: number, rect: vec4) {
    if (isClampNeeded(x1, y1, x2, y2)) {
        clipSegmentToRect(x1, y1, x2, y2, rect, segment);
        writeSegment();
        return;
    }
    writePair(x1, y1, x2, y2);
    return;

}
function writeSegment() {
    buffer[offset + 0] = segment[0];
    buffer[offset + 1] = segment[1];
    buffer[offset + 2] = segment[2];
    buffer[offset + 3] = segment[3];
    offset += 4;
}

function writePair(x1: number, y1: number, x2: number, y2: number) {
    buffer[offset + 0] = x1;
    buffer[offset + 1] = y1;
    buffer[offset + 2] = x2;
    buffer[offset + 3] = y2;
    offset += 4;
}

function resize(requiredFloats: number) {
    const newSize = Math.max(requiredFloats, buffer.length * 1.5) | 0;
    const newArr = new Float16Array(newSize);
    newArr.set(buffer);
    buffer = newArr;
    resized = true;
}

function isRefillNeeded() {
    const result = oldParams.camera.x !== camera.x
        || oldParams.camera.y !== camera.y
        || oldParams.camera.zoom !== camera.zoom
        || oldParams.mode !== settings.wireDrawing
        || oldParams.wiresCount !== circuit.wires.size
        || oldParams.showWiresMode !== showWiresMode
        || oldParams.tool !== selectedTool
        ;
    if (!result) return false;
    oldParams.camera.x = camera.x;
    oldParams.camera.y = camera.y;
    oldParams.camera.zoom = camera.zoom;
    oldParams.mode = settings.wireDrawing;
    oldParams.wiresCount = circuit.wires.size;
    oldParams.showWiresMode = showWiresMode;
    oldParams.tool = selectedTool;
    return true
}

export function draw(renderer: IWireRenderer, canvas: { width: number, height: number }): void {
    const shouldDrawPermanent = showWiresMode === ShowWiresMode.Always ||
        (showWiresMode === ShowWiresMode.Connect && selectedTool === ToolMode.Connect);

    const shouldDrawTemporary = showWiresMode === ShowWiresMode.Always ||
        ((showWiresMode === ShowWiresMode.Connect || showWiresMode === ShowWiresMode.Temporary)
            && selectedTool === ToolMode.Connect);

    const shouldRefill = isDragging || isRefillNeeded();
    if (!shouldRefill) {
        if (shouldDrawPermanent) {
            renderer.setup(colors.wires);
            renderer.finalize(0, permamentEnd);
        }
        if (!shouldDrawTemporary) return;
    }

    mode = settings.wireDrawing;
    // if (mode === 'dimple' && camera.zoom < 0.6) mode = 'simple';
    const worldRect: Rect = cameraWorldViewportRect(camera, canvas.width, canvas.height);
    h = gridSize * camera.zoom;
    const h5 = 5 * h;
    rect[0] = -h5;
    rect[1] = canvas.width + h5;
    rect[2] = -h5;
    rect[3] = canvas.height + h5;

    HALF = h * 0.5;
    QUARTER = h * 0.25;
    ONE_Q = h * 1.25;
    ONE_H = h * 1.5;

    const check = settings.wireDrawing === 'manhattan'
        ? (source: Point, target: Point, worldRect: Rect) => {
            if (source.x >= target.x - 1) return segment90LIntersectsRect(source, target, worldRect);
            return segment90SIntersectsRect(source, target, worldRect)
        }
        : segmentIntersectsRect;

    const processWire = (source: Point, target: Point) => {
        if (segmentAsideRect(source, target, worldRect)) return;
        if (
            pointInRect(source, worldRect) ||
            pointInRect(target, worldRect) ||
            check(source, target, worldRect)
        ) {
            writeWire(source, target);
        }
    };



    if (shouldRefill && shouldDrawPermanent) {
        reset();
        renderer.setup(colors.wires);
        for (const wire of circuit.wires.values()) {
            processWire(wire.src, wire.dst);
        }
        renderer.finalize(0, offset);
        permamentEnd = offset;
    }

    if (shouldDrawTemporary) {
        reset();
        offset = permamentEnd;
        renderer.setup(colors.tempWires);
        const ct = connectTool;
        let wiresCount = 0;
        if (ct.mode === ConnectMode.NtoN) {
            if (ct.sources[0].size === 0 || ct.sources[1].size === 0) return;
            for (const s of ct.sources[0]) {
                for (const t of ct.sources[1]) {
                    processWire(s, t);
                    ++wiresCount;
                    if (wiresCount > MAX_TEMP_WIRES) break;
                }
                if (wiresCount > MAX_TEMP_WIRES) break;
            }
                
        }
        else if (ct.mode === ConnectMode.Sequence) {
            if (ct.sources[0].size === 0) return;
            let prev: Point | null = null;
            for (const el of ct.sources[0]) {
                if (prev) processWire(prev, el);
                prev = el;
                ++wiresCount;
                if (wiresCount > MAX_TEMP_WIRES) break;
            }
        }
        else if (ct.mode === ConnectMode.Parallel) {
            if (ct.sources[0].size === 0 || ct.sources[1].size === 0) return;
            const src = ct.sources[0].values();
            const tgt = ct.sources[1].values();
            let s, t;
            while ((s = src.next().value) && (t = tgt.next().value)) {
                processWire(s, t);
                ++wiresCount;
                if (wiresCount > MAX_TEMP_WIRES) break;
            }
        }
        else if (ct.mode === ConnectMode.Decoder) {
            if (ct.sources[0].size === 0 || ct.sources[1].size === 0 || ct.sources[2].size === 0) return;
            const pos = ct.sources[0].values();
            const neg = ct.sources[1].values();
            const targets = ct.sources[2];
            let p: Point | undefined, n: Point | undefined;
            let k = 1;
            while ((p = pos.next().value) && (n = neg.next().value)) {
                let j = k, flag = false, source = n;
                for (const target of targets) {
                    processWire(source, target);
                    if (--j === 0) { flag = !flag; source = flag ? p : n; j = k; }
                    ++wiresCount;
                    if (wiresCount > MAX_TEMP_WIRES) break;
                }
                k <<= 1;
                if (wiresCount > MAX_TEMP_WIRES) break;
            }
        }
        renderer.finalize(permamentEnd, offset);
    }
}