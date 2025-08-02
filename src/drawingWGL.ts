import {
    camera, canvas, gridSize,
    worldToTranslatedScreen, worldToScreen,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, circuit,
    Point
} from "./main";

let ctx: WebGLRenderingContext;

export function initContext() {
    ctx = canvas.getContext('webgl') as WebGLRenderingContext;
}

export function draw() {
    ctx.clearColor(0.0, 0.0, 0.0, 1.0);
    ctx.clear(ctx.COLOR_BUFFER_BIT);
}
