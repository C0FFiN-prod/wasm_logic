import { drawingTimer } from '../drawings';
import { camera, circuitIO, historyManager } from '../main';
import { floorPoint, screenToWorld } from '../utils/utils';

const DRAG_THRESHOLD = 5; // пикселей, после которых действие считается перетаскиванием

interface DragState {
    isDragging: boolean;
    hasMoved: boolean;
    type: string;
    ghost: HTMLElement | null;
    startX: number;
    startY: number;
}

const dragState: DragState = {
    isDragging: false,
    hasMoved: false,
    type: '',
    ghost: null,
    startX: 0,
    startY: 0
};

function createGhost(x: number, y: number, type: string): HTMLElement {
    const ghost = document.createElement('div');
    ghost.className = 'palette-drag-ghost';
    ghost.textContent = type.toUpperCase();
    Object.assign(ghost.style, {
        left: `${x}px`,
        top: `${y}px`,
    });
    return ghost;
}

function handleMouseDown(e: MouseEvent, btnId: string) {
    e.preventDefault();
    const type = btnId.replace('add-', '');

    dragState.isDragging = true;
    dragState.hasMoved = false;
    dragState.type = type;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.ghost = createGhost(e.clientX, e.clientY, type);
}

function handleMouseMove(e: MouseEvent) {
    if (!dragState.isDragging || !dragState.ghost) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    if (!dragState.hasMoved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragState.hasMoved = true;
        document.body.appendChild(dragState.ghost);
    }

    if (dragState.hasMoved) {
        dragState.ghost.style.left = `${e.clientX}px`;
        dragState.ghost.style.top = `${e.clientY}px`;
    }
}

function handleMouseUp(e: MouseEvent) {
    if (!dragState.isDragging) return;

    const ghost = dragState.ghost;
    if (ghost) ghost.remove();

    const currentType = dragState.type;
    const wasDrag = dragState.hasMoved;

    dragState.isDragging = false;
    dragState.ghost = null;

    if (!wasDrag) {
        const newEl = circuitIO.addElement(currentType.toUpperCase(), {});
        if (newEl !== null) {
            historyManager.recordAddElements([newEl]);
            drawingTimer.step();
        }
        return;
    }

    if (e.target === drawingTimer.currentCanvas()) {
        const coords = screenToWorld(camera, e.clientX, e.clientY);
        const newEl = circuitIO.addElement(currentType.toUpperCase(), { pos: floorPoint(coords) });

        if (newEl !== null) {
            historyManager.recordAddElements([newEl]);
            drawingTimer.step();
        }
    }
}

export function initElementPalette() {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#fm-palette [id^="add-"]');

    const boundOnDown = (e: MouseEvent) => {
        const target = e.currentTarget as HTMLButtonElement;
        if (target?.id) handleMouseDown(e, target.id);
    };
    const boundOnMove = handleMouseMove;
    const boundOnUp = (e: MouseEvent) => handleMouseUp(e);

    buttons.forEach(btn => {
        btn.onclick = null;
        btn.addEventListener('mousedown', boundOnDown);
    });

    window.addEventListener('mousemove', boundOnMove);
    window.addEventListener('mouseup', boundOnUp);

    return () => {
        buttons.forEach(btn => btn.removeEventListener('mousedown', boundOnDown));
        window.removeEventListener('mousemove', boundOnMove);
        window.removeEventListener('mouseup', boundOnUp);
    };
}