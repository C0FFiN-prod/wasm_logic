import { isClampNeeded } from ".";
import { colors, ConnectMode, gridSize, ShowWiresMode, ToolMode, type Point, type Rect, type vec4 } from "../consts";
import { camera, circuit, selectedTool, settings, showWiresMode } from "../main";
import { connectTool } from "../utils/connectionTool";
import { segmentIntersectsRect } from "../utils/geometry";
import { clipSegmentToRect, worldToScreen } from "../utils/utils";

export interface IWireRenderer {
    setup(color: vec4): void;
    finalize(): void;
}

export let buffer = new Float16Array(1_000_000);
export let offset = 0;
export let resized = false;


export function reset() { offset = 0; resized = false; }

export function writeWire(src: Point, dst: Point, zoom: number = 1) {
    if (offset > buffer.length - 100) resize(buffer.length + 100);
    const mode = settings.wireDrawing;
    const h = gridSize * zoom;
    const HALF = h * 0.5;
    const QUARTER = h * 0.25;
    const ONE_Q = h * 1.25;
    const ONE_H = h * 1.5;
    const sx = src.x + h;
    const sy = src.y + HALF;
    const dx = dst.x;
    const dy = dst.y + HALF;



    if (mode === "simple") {
        writePair(sx, sy, dx, dy);
        return;
    }

    const isBack = dst.x - h <= src.x;
    const sameY = dst.y === src.y;
    if (sameY && (!isBack || dst.x >= src.x)) {
        writePair(sx, sy, dx, dy);
        return;
    } else if (sameY) {
        const mx = src.x + ONE_Q;
        const nx = dst.x - QUARTER;
        const hy = src.y - HALF;

        writePair(sx, sy, mx, sy);
        writePair(mx, sy, mx, hy);
        writePair(mx, hy, nx, hy);
        writePair(nx, hy, nx, dy);
        writePair(nx, dy, dx, dy);
        return;
    }

    if (mode === "dimple") {
        if (isBack) {
            const s = Math.sign(dst.y - src.y) * HALF;
            const mx = src.x + ONE_Q;
            const my = src.y + HALF + s;
            const nx = dst.x - QUARTER;
            const ny = dst.y + HALF - s;

            writePair(sx, sy, mx, sy);
            writePair(mx, sy, mx, my);
            writePair(mx, my, nx, ny);
            writePair(nx, ny, nx, dy);
            writePair(nx, dy, dx, dy);
        } else {
            const mx = src.x + ONE_H;
            const nx = dst.x - HALF;

            writePair(sx, sy, mx, sy);
            writePair(mx, sy, nx, dy);
            writePair(nx, dy, dx, dy);
        }
        return;
    }

    // manhattan
    if (isBack) {
        const diff = Math.abs(dst.y - src.y);
        const yStep = Math.sign(dst.y - src.y) * (diff > h ? h : HALF);
        const yMid = sy + yStep;
        const mx = sx + QUARTER;
        const nx = dx - QUARTER;

        writePair(sx, sy, mx, sy);
        writePair(mx, sy, mx, yMid);
        writePair(mx, yMid, nx, yMid);
        writePair(nx, yMid, nx, dy);
        writePair(nx, dy, dx, dy);
        return;
    }

    // manhattan forward
    const midX = src.x + (dst.x - src.x + h) * 0.5;
    writePair(sx, sy, midX, sy);
    writePair(midX, sy, midX, dy);
    writePair(midX, dy, dx, dy);
}

export function writePair(x1: number, y1: number, x2: number, y2: number) {
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

export function draw(renderer: IWireRenderer, canvas: {width: number, height: number}): void {
    const screenRect: Rect = { x0: 0, x1: canvas.width, y0: 0, y1: canvas.height };
    const h = gridSize * camera.zoom;

    const processWire = (source: Point, target: Point) => {
        const start = worldToScreen(camera, source.x, source.y);
        const end = worldToScreen(camera, target.x, target.y);
        if (segmentIntersectsRect(start, end, screenRect)) {
            const [s, e] = isClampNeeded(start, end)
                ? clipSegmentToRect(start, end, -5 * h, canvas.width + 5 * h, canvas.height + 5 * h, -5 * h)
                : [start, end];
            writeWire(s, e, camera.zoom);
        }
    };

    const shouldDrawPermanent = showWiresMode === ShowWiresMode.Always ||
        (showWiresMode === ShowWiresMode.Connect && selectedTool === ToolMode.Connect);

    const shouldDrawTemporary = showWiresMode === ShowWiresMode.Always ||
        ((showWiresMode === ShowWiresMode.Connect || showWiresMode === ShowWiresMode.Temporary)
            && selectedTool === ToolMode.Connect);

    if (shouldDrawPermanent) {
        reset();
        renderer.setup(colors.wires);
        for (const wire of circuit.wires.values()) {
            processWire(wire.src, wire.dst);
        }
        renderer.finalize();
    }

    if (shouldDrawTemporary) {
        reset();
        renderer.setup(colors.tempWires);
        const ct = connectTool;

        if (ct.mode === ConnectMode.NtoN) {
            if (ct.sources[0].size === 0 || ct.sources[1].size === 0) return;
            for (const s of ct.sources[0])
                for (const t of ct.sources[1])
                    processWire(s, t);
        }
        else if (ct.mode === ConnectMode.Sequence) {
            if (ct.sources[0].size === 0) return;
            let prev: Point | null = null;
            for (const el of ct.sources[0]) {
                if (prev) processWire(prev, el);
                prev = el;
            }
        }
        else if (ct.mode === ConnectMode.Parallel) {
            if (ct.sources[0].size === 0 || ct.sources[1].size === 0) return;
            const src = ct.sources[0].values();
            const tgt = ct.sources[1].values();
            let s, t;
            while ((s = src.next().value) && (t = tgt.next().value))
                processWire(s, t);
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
                }
                k <<= 1;
            }
        }
        renderer.finalize();
    }
}