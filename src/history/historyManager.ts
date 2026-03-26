import { Timer, type Circuit, type LogicElement, type Wire, LogicGate } from '../logic';
import type { CircuitIO } from '../IOs/circuitIO';
import { ToolMode, type Point } from '../consts';
import { selectedElements, selectedTool } from '../main';
import { getSetDifference } from '../utils/utils';

export type InverseData = {
    'ADD_ELEMENTS': { elements: LogicElement[], wires: Wire[] };
    'REMOVE_ELEMENTS': { elements: LogicElement[], wires: Wire[] };
    'MOVE_ELEMENTS': {
        deltaX: number;
        deltaY: number;
    };
    'ROTATE_ELEMENTS': {
        center: Point;
        clockwise: boolean;
    };
    'FLIP_ELEMENTS': {
        center: Point;
        vertical: boolean;
    };
    'CHANGE_COLOR': {
        oldColors: Map<LogicElement, string>;
        newColor: string;
    };
    'CHANGE_GATE_TYPE': {
        oldTypes: Map<LogicGate, number>;
        newType: number;
    };
    'CHANGE_TIMER_DELAY': {
        oldDelays: Map<Timer, number>;
        newDelay: number;
    };
    // Один тип данных для двух экшенов
    'ADD_CONNECTIONS': { wires: Wire[] };
    'REMOVE_CONNECTIONS': { wires: Wire[] };
    'PASTE_ELEMENTS': { elements: LogicElement[], wires: Wire[] };
    'DUPLICATE_ELEMENTS': { elements: LogicElement[], wires: Wire[] };
    'ADD_SCHEME_FROM_FILE': { elements: LogicElement[], wires: Wire[] };
    'SELECTION_CHANGE': {
        added: LogicElement[];
        removed: LogicElement[];
    }
}
export type ActionType = keyof InverseData;

export interface HistoryAction<T extends ActionType> {
    type: T;
    inverseData: InverseData[T];
    selectionState?: Set<LogicElement>;
    description: string;
}

export interface HistoryManagerOptions {
    maxMemoryMB?: number;
    onHistoryChange?: (canUndo: boolean, canRedo: boolean, undoStack: HistoryAction<ActionType>[], redoStack: HistoryAction<ActionType>[]) => void;
}

export class HistoryManager {
    private undoStack: HistoryAction<ActionType>[] = [];
    private redoStack: HistoryAction<ActionType>[] = [];
    private maxMemoryBytes: number;
    private currentMemoryBytes: number = 0;
    private isRecording: boolean = true;
    private onHistoryChange?: (canUndo: boolean, canRedo: boolean, undoStack: HistoryAction<ActionType>[], redoStack: HistoryAction<ActionType>[]) => void;
    private circuit: Circuit;
    private circuitIO: CircuitIO;
    private selectionBackup: Set<LogicElement> | null = null;

    constructor(
        circuit: Circuit,
        circuitIO: CircuitIO,
        options: HistoryManagerOptions = {}
    ) {
        this.circuit = circuit;
        this.circuitIO = circuitIO;
        this.maxMemoryBytes = (options.maxMemoryMB ?? 100) * 1024 * 1024;
        this.onHistoryChange = options.onHistoryChange;
    }

    private calculateActionSize(action: HistoryAction<ActionType>): number {
        const metaSize = JSON.stringify({
            type: action.type,
            description: action.description,
        }).length;

        const selectionSize = (action.selectionState?.size ?? 0) * 8;

        let inverseDataSize = 0;

        switch (action.type) {
            case 'ADD_ELEMENTS':
            case 'REMOVE_ELEMENTS':
            case 'PASTE_ELEMENTS':
            case 'DUPLICATE_ELEMENTS':
            case 'ADD_SCHEME_FROM_FILE':
                inverseDataSize = (action as HistoryAction<typeof action.type>).inverseData.elements.length * 24;
                break;

            case 'MOVE_ELEMENTS':
                inverseDataSize = 16;
                break;

            case 'ROTATE_ELEMENTS':
                inverseDataSize = 24;
                break;

            case 'FLIP_ELEMENTS':
                inverseDataSize = 24;
                break;

            case 'CHANGE_COLOR':
                const { oldColors, newColor } = (action as HistoryAction<typeof action.type>).inverseData;
                inverseDataSize =
                    oldColors.size * 16 + // entry: elementId(8) + color(8)
                    newColor.length;      // HEX-строка
                break;

            case 'CHANGE_GATE_TYPE':
                const { oldTypes, newType } = (action as HistoryAction<typeof action.type>).inverseData;
                inverseDataSize =
                    oldTypes.size * 16 + // entry: elementId(8) + type(8)
                    8;                   // newType
                break;

            case 'CHANGE_TIMER_DELAY':
                const { oldDelays, newDelay } = (action as HistoryAction<typeof action.type>).inverseData;
                inverseDataSize =
                    oldDelays.size * 16 + // entry: elementId(8) + delay(8)
                    8;                    // newDelay
                break;

            case 'ADD_CONNECTIONS':
            case 'REMOVE_CONNECTIONS':
                inverseDataSize = (action as HistoryAction<typeof action.type>).inverseData.wires.length * 16;
                break;

            case 'SELECTION_CHANGE':
                const { added, removed } = (action as HistoryAction<typeof action.type>).inverseData;
                inverseDataSize = (added.length + removed.length) * 16;
                break;
            
            
            
            // ── Защита от необработанных типов ──
            default: {
                const _exhaustive: never = action.type;
                console.warn(`Unknown action type in calculateActionSize: ${_exhaustive}`);
                inverseDataSize = 0;
            }
        }

        return metaSize + selectionSize + inverseDataSize;
    }

    private trimHistory(): void {
        while (this.currentMemoryBytes > this.maxMemoryBytes && this.undoStack.length > 0) {
            const oldest = this.undoStack.shift();
            if (oldest) {
                this.currentMemoryBytes -= this.calculateActionSize(oldest);
            }
        }
    }

    private notifyHistoryChange(): void {
        if (this.onHistoryChange) {
            this.onHistoryChange(this.canUndo(), this.canRedo(), this.undoStack, this.redoStack);
        }
    }

    private getDescription(type: ActionType): string {
        const descriptions: Record<ActionType, string> = {
            ADD_ELEMENTS: 'Добавление элементов',
            REMOVE_ELEMENTS: 'Удаление элементов',
            MOVE_ELEMENTS: 'Перемещение элементов',
            ROTATE_ELEMENTS: 'Поворот элементов',
            FLIP_ELEMENTS: 'Отражение элементов',
            CHANGE_COLOR: 'Изменение цвета',
            CHANGE_GATE_TYPE: 'Изменение типа вентиля',
            CHANGE_TIMER_DELAY: 'Изменение задержки таймера',
            ADD_CONNECTIONS: 'Добавление соединений',
            REMOVE_CONNECTIONS: 'Удаление соединений',
            PASTE_ELEMENTS: 'Вставка элементов',
            DUPLICATE_ELEMENTS: 'Дублирование элементов',
            ADD_SCHEME_FROM_FILE: 'Добавление схемы из файла',
            SELECTION_CHANGE: 'Изменение выделения',
        };
        return descriptions[type];
    }

    private pushAction<T extends ActionType>(
        type: T,
        inverseData: InverseData[T]
    ): void {
        if (!this.isRecording) return;
        if (Object.keys(inverseData).length === 0) return;

        const action: HistoryAction<T> = {
            type,
            inverseData,
            description: this.getDescription(type),
        };

        const size = this.calculateActionSize(action);
        if (size > this.maxMemoryBytes) {
            console.warn('History action too large, skipping');
            return;
        }

        this.undoStack.push(action);
        this.redoStack = [];
        this.currentMemoryBytes += size;
        this.trimHistory();
        this.notifyHistoryChange();
    }

    // === Публичные методы для записи действий ===

    recordAddElements(elements: LogicElement[]): void {
        const wires: Wire[] = [];
        for (const el of elements) {
            for (const input of el.inputs) {
                const wire = this.circuit.wires.get(`${input.id}|${el.id}`);
                if (wire) wires.push(wire);
            }
        }
        this.pushAction('ADD_ELEMENTS', { elements, wires });
    }

    recordRemoveElements(elements: LogicElement[], wires: Wire[]): void {
        this.pushAction('REMOVE_ELEMENTS', { elements, wires });
    }

    recordMoveElements(deltaX: number, deltaY: number): void {
        if (deltaX === 0 && deltaY === 0) return;
        this.pushAction('MOVE_ELEMENTS', { deltaX, deltaY });
    }

    recordRotateElements(center: Point, clockwise: boolean): void {
        this.pushAction('ROTATE_ELEMENTS', { center, clockwise });
    }

    recordFlipElements(center: Point, vertical: boolean): void {
        this.pushAction('FLIP_ELEMENTS', { center, vertical });
    }

    recordChangeColor(oldColors: Map<LogicElement, string>, newColor: string): void {
        this.pushAction('CHANGE_COLOR', { oldColors, newColor });
    }

    recordChangeGateType(oldTypes: Map<LogicGate, number>, newType: number): void {
        if(oldTypes.size === 0) return;
        this.pushAction('CHANGE_GATE_TYPE', { oldTypes, newType });
    }

    recordChangeTimerDelay(oldDelays: Map<Timer, number>, newDelay: number): void {
        if (oldDelays.size === 0) return;
        this.pushAction('CHANGE_TIMER_DELAY', { oldDelays, newDelay });
    }

    recordAddConnections(wires: Wire[]): void {
        if (wires.length === 0) return;
        this.pushAction('ADD_CONNECTIONS', { wires });
    }

    recordRemoveConnections(wires: Wire[]): void {
        if (wires.length === 0) return;
        this.pushAction('REMOVE_CONNECTIONS', { wires });
    }

    recordPasteElements(elements: LogicElement[]): void {
        const wires: Wire[] = [];
        for (const el of elements) {
            for (const input of el.inputs) {
                const wire = this.circuit.wires.get(`${input.id}|${el.id}`);
                if (wire) wires.push(wire);
            }
        }
        this.pushAction('PASTE_ELEMENTS', { elements, wires });
    }

    recordDuplicateElements(elements: LogicElement[]): void {
        const wires: Wire[] = [];
        for (const el of elements) {
            for (const input of el.inputs) {
                const wire = this.circuit.wires.get(`${input.id}|${el.id}`);
                if (wire) wires.push(wire);
            }
        }
        this.pushAction('DUPLICATE_ELEMENTS', { elements, wires });
    }

    recordAddSchemeFromFile(elements: LogicElement[]): void {
        const wires: Wire[] = [];
        for (const el of elements) {
            for (const input of el.inputs) {
                const wire = this.circuit.wires.get(`${input.id}|${el.id}`);
                if (wire) wires.push(wire);
            }
        }
        this.pushAction('ADD_SCHEME_FROM_FILE', { elements, wires });
    }

    recordSelectionChange(selection: Set<LogicElement>): void {
        let added: LogicElement[];
        let removed: LogicElement[];
        if (selection.size === 0) {
            if (this.selectionBackup && this.selectionBackup.size > 0) {
                added = [];
                removed = [...this.selectionBackup];
            } else return;
        } else if (!this.selectionBackup || this.selectionBackup.size === 0) {
            added = [...selection];
            removed = [];
        } else {
            added = getSetDifference(selection, this.selectionBackup);
            removed = getSetDifference(this.selectionBackup, selection);
        }

        if (added.length === 0 && removed.length === 0) return;
        this.pushAction('SELECTION_CHANGE', { added, removed });
    }


    // === Selection ===
    pushSelectionState(selection: Set<LogicElement>): void {
        this.selectionBackup = new Set(selection);
    }

    // === Undo/Redo ===

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    undo(): boolean {
        if (!this.canUndo()) return false;

        this.isRecording = false;
        const action = this.undoStack.pop()!;
        this.executeAction(action, true);
        this.redoStack.push(action);
        this.isRecording = true;

        this.notifyHistoryChange();
        return true;
    }

    redo(): boolean {
        if (!this.canRedo()) return false;

        this.isRecording = false;
        const action = this.redoStack.pop()!;
        this.executeAction(action, false);
        this.undoStack.push(action);
        this.isRecording = true;

        this.notifyHistoryChange();
        return true;
    }

    private executeAction(action: HistoryAction<ActionType>, isUndo: boolean): void {
        switch (action.type) {
            case 'ADD_ELEMENTS':
            case 'REMOVE_ELEMENTS':
            case 'PASTE_ELEMENTS':
            case 'DUPLICATE_ELEMENTS':
            case 'ADD_SCHEME_FROM_FILE':
                this.executeAddRemoveElements(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'MOVE_ELEMENTS':
                this.executeMoveElements(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'ROTATE_ELEMENTS':
                this.executeRotateElements(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'FLIP_ELEMENTS':
                this.executeFlipElements(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'CHANGE_COLOR':
                this.executeChangeColor(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'CHANGE_GATE_TYPE':
                this.executeChangeGateType(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'CHANGE_TIMER_DELAY':
                this.executeChangeTimerDelay(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'ADD_CONNECTIONS':
            case 'REMOVE_CONNECTIONS':
                this.executeConnections(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'SELECTION_CHANGE':
                this.executeSelectionChange(action as HistoryAction<typeof action.type>, isUndo);
                break;
        }
    }

    private executeAddRemoveElements<T extends 'ADD_ELEMENTS' | 'PASTE_ELEMENTS' | 'DUPLICATE_ELEMENTS' | 'ADD_SCHEME_FROM_FILE' | 'REMOVE_ELEMENTS'>(
        action: HistoryAction<T>, isUndo: boolean): void {
        if ((action.type === 'REMOVE_ELEMENTS') === isUndo) {
            // Сначала добавляем элементы обратно в чанки
            for (const el of action.inverseData.elements) {
                this.circuit.addExitstingElement(el);
            }
            // Затем восстанавливаем провода
            for (const wire of action.inverseData.wires) {
                this.circuit.addWire(wire.src, wire.dst);
            }
        } else {
            for (const el of action.inverseData.elements) {
                this.circuit.removeWiresForElement(el);
                this.circuit.deleteElement(el);
            }
        }
    }

    private executeMoveElements(action: HistoryAction<'MOVE_ELEMENTS'>, isUndo: boolean): void {
        const { deltaX, deltaY } = action.inverseData;

        const mul = isUndo ? -1 : 1;
        for (const el of selectedElements) {
            this.circuit.moveElementBy(el, { x: deltaX * mul, y: deltaY * mul });
        }
    }

    private executeRotateElements<T extends 'ROTATE_ELEMENTS'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { center, clockwise } = action.inverseData;

        const actualClockwise = isUndo ? !clockwise : clockwise;
        this.circuitIO.rotateSelected(selectedElements, actualClockwise, center);
    }

    private executeFlipElements<T extends 'FLIP_ELEMENTS'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { center, vertical } = action.inverseData;

        this.circuitIO.flipSelected(selectedElements, vertical, center);
    }

    private executeChangeColor<T extends 'CHANGE_COLOR'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldColors, newColor } = action.inverseData;

        for (const [el, oldColor] of oldColors.entries()) {
            el.color = isUndo ? oldColor : newColor;
        }
    }

    private executeChangeGateType<T extends 'CHANGE_GATE_TYPE'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldTypes, newType } = action.inverseData;

        for (const [el, oldType] of oldTypes.entries()) {
            el.gateType = isUndo ? oldType : newType;
        }
    }

    private executeChangeTimerDelay<T extends 'CHANGE_TIMER_DELAY'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldDelays, newDelay } = action.inverseData;

        for (const [el, oldDelay] of oldDelays.entries()) {
            el.setDelay(isUndo ? oldDelay : newDelay);
        }
    }

    private executeConnections<T extends 'ADD_CONNECTIONS' | 'REMOVE_CONNECTIONS'>(action: HistoryAction<T>, isUndo: boolean): void {
        for (const wire of action.inverseData.wires) {
            if (action.type === 'ADD_CONNECTIONS') {
                if (isUndo) {
                    this.circuit.removeWire(wire.src, wire.dst);
                } else if (!isUndo) {
                    this.circuit.addWire(wire.src, wire.dst);
                }
            } else if (action.type === 'REMOVE_CONNECTIONS') {
                if (isUndo) {
                    this.circuit.addWire(wire.src, wire.dst);
                } else if (!isUndo) {
                    this.circuit.removeWire(wire.src, wire.dst);
                }
            }
        }
    }

    private executeSelectionChange<T extends 'SELECTION_CHANGE'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { added, removed } = action.inverseData;
        const toRemove = isUndo ? added : removed;
        const toAdd = isUndo ? removed : added;

        for (const el of toRemove) {
            selectedElements.delete(el);
        }
        for (const el of toAdd) {
            selectedElements.add(el);
        }
    }
    // === Утилиты ===

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.selectionBackup = null;
        this.currentMemoryBytes = 0;
        this.notifyHistoryChange();
    }

    setRecording(enabled: boolean): void {
        this.isRecording = enabled;
    }

    getUndoCount(): number {
        return this.undoStack.length;
    }

    getRedoCount(): number {
        return this.redoStack.length;
    }

    getLastUndoActionType(): ActionType | undefined {
        return this.undoStack.at(this.undoStack.length - 1)?.type;
    }

    getLastRedoActionType(): ActionType | undefined {
        return this.redoStack.at(0)?.type;
    }
}