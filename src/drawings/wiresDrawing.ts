import { gridSize, type Point } from "../consts";
import { settings } from "../main";
import { clamp } from "../utils/utils";


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
