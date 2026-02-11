import * as dWebGl from "./drawingWGL";
import * as dCanvas from "./drawingCanvas";
import { isSimulating, settings } from "../main";
import type { Drawings } from "../consts";
import { dimple, manhattan, simple } from "./wiresDrawing";
let draw = dWebGl.draw;
let initContext = dWebGl.initContext;
let displayRefreshRate = 0;
let canvas: HTMLCanvasElement;
const canvases: Record<Drawings, { canvas: HTMLCanvasElement | null, used: boolean }> = {
    'canvas': { canvas: null, used: false },
    'webgl': { canvas: null, used: false },
};
export const drawingTimer = {
    interval: 0,
    active: false,
    setCanvases(_canvases: Record<Drawings, HTMLCanvasElement | null>) {
        for (const [k, v] of Object.entries(_canvases)) {
            canvases[<Drawings>k] = { canvas: v, used: false };
        }
    },
    currentCanvas() {
        return canvas;
    },
    changeMaxFPS() {
        clearInterval(this.interval);
        displayRefreshRate = settings.maxFPS;
        if (this.active) this.setup(true);
    },
    changeDrawing() {
        switch (settings.drawing) {
            case 'canvas':
                draw = dCanvas.draw;
                initContext = dCanvas.initContext;
                break;
            case 'webgl':
            default:
                draw = dWebGl.draw;
                initContext = dWebGl.initContext;
                break;
        }
        clearInterval(this.interval);
        const ctxOwner = canvases[settings.drawing];
        if (ctxOwner !== undefined && ctxOwner.canvas !== null) {
            canvas = ctxOwner.canvas;
            if (!ctxOwner.used) initContext(ctxOwner.canvas);
            if (this.active) this.setup(true);
            else this.step();
            ctxOwner.used = true;
        }
    },
    setup(force?: boolean) {
        if (!force && this.active) return;
        this.active = true;
        this.interval = setInterval(() =>
            requestAnimationFrame(draw), 1000 / (displayRefreshRate || 60));
    },
    stop() {
        if (isSimulating) return;
        clearInterval(this.interval);
        this.active = false;
    },
    step() {
        if (!this.active) requestAnimationFrame(draw);
        console.log(1);
    }
};

export const overlayIconMap = new Map<string, number>(Object.entries({
    // overlays
    x: 1,
    sw: 2,
    in: 3,
    out: 4,
    vv: 5,
    a0: 6,
    a1: 7,
    an: 8,
    b0: 9,
    b1: 10,
    bn: 11,
    r0: 12,
    r1: 13,
    rn: 14,
}));

export function changeWireDrawingAlg() {
    switch (settings.wireDrawing) {
        case 'dimple': wireDrawingAlg = dimple; break;
        case 'manhattan': wireDrawingAlg = manhattan; break;
        default:
        case 'simple': wireDrawingAlg = simple; break;
    }
} export let wireDrawingAlg = simple;
