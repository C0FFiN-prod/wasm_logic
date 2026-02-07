import * as dWebGl from "./drawingWGL";
import * as dCanvas from "./drawingCanvas";
import { isSimulating, settings } from "../main";
import type { Drawings } from "../consts";
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
    }
};