import { gridSize, type Point } from "../consts";
import { settings } from "../main";

const halv = gridSize * .5
const quater = gridSize * .25;
const oneAndQuater = gridSize * 1.25;
const oneAndHalv = gridSize * 1.5;

export let wireDrawingAlg = simple;
export function changeWireDrawingAlg() {        
    switch (settings.wireDrawing) {
        case 'dimple': wireDrawingAlg = dimple; break;
        case 'manhattan': wireDrawingAlg = manhattan; break;
        default:
        case 'simple': wireDrawingAlg = simple; break;
    }
}

function sameY(src: Point, dst: Point) {
    if (dst.x >= src.x) return simple(src, dst);

    return [
        src.x + gridSize,
        src.y + halv,

        src.x + oneAndQuater,
        src.y + halv,
        src.x + oneAndQuater,
        src.y + halv,

        src.x + oneAndQuater,
        src.y - halv,
        src.x + oneAndQuater,
        src.y - halv,

        dst.x - quater,
        src.y - halv,
        dst.x - quater,
        src.y - halv,
        
        dst.x - quater,
        dst.y + halv,
        dst.x - quater,
        dst.y + halv,

        dst.x,
        dst.y + halv,
    ]
}

function simple(src: Point, dst: Point) {
    return [
        src.x + gridSize,
        src.y + halv,

        dst.x,
        dst.y + halv
    ]
}

function dimple(src: Point, dst: Point) {
    if (dst.y === src.y) return sameY(src, dst);
    if (dst.x - gridSize <= src.x) {
        const dy = Math.sign(dst.y - src.y) * halv;
        return [
            src.x + gridSize,
            src.y + halv,

            src.x + oneAndQuater,
            src.y + halv,
            src.x + oneAndQuater,
            src.y + halv,

            src.x + oneAndQuater,
            src.y + halv + dy,
            src.x + oneAndQuater,
            src.y + halv + dy,

            dst.x - quater,
            dst.y + halv - dy,
            dst.x - quater,
            dst.y + halv - dy,

            dst.x - quater,
            dst.y + halv,
            dst.x - quater,
            dst.y + halv,

            dst.x,
            dst.y + halv,
        ]
    }
    return [
        src.x + gridSize,
        src.y + halv,

        src.x + oneAndHalv,
        src.y + halv,
        src.x + oneAndHalv,
        src.y + halv,

        dst.x - halv,
        dst.y + halv,
        dst.x - halv,
        dst.y + halv,

        dst.x,
        dst.y + halv,
    ]
}

function manhattan(src: Point, dst: Point) {
    if (dst.y === src.y) return sameY(src, dst);
    if (dst.x - gridSize <= src.x) {
        const dy = Math.sign(dst.y - src.y) * (Math.abs(dst.y - src.y) > gridSize ? gridSize : halv);
        return [
            src.x + gridSize,
            src.y + halv,

            src.x + oneAndQuater,
            src.y + halv,
            src.x + oneAndQuater,
            src.y + halv,

            src.x + oneAndQuater,
            src.y + halv + dy,
            src.x + oneAndQuater,
            src.y + halv + dy,

            dst.x - quater,
            src.y + halv + dy,
            dst.x - quater,
            src.y + halv + dy,

            dst.x - quater,
            dst.y + halv,
            dst.x - quater,
            dst.y + halv,

            dst.x,
            dst.y + halv,
        ]
    }
    const centerX = (dst.x - src.x + gridSize) / 2;
    return [
        src.x + gridSize,
        src.y + halv,

        src.x + centerX,
        src.y + halv,
        src.x + centerX,
        src.y + halv,

        src.x + centerX,
        dst.y + halv,
        src.x + centerX,
        dst.y + halv,

        dst.x,
        dst.y + halv,
    ]
}
