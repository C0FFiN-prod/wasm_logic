import { Timer, type Circuit, type LogicElement, type Wire, LogicGate } from '../logic';
import type { CircuitIO } from '../IOs/circuitIO';
import { ConnectMode, SelectionSets, ToolMode, type ElementPDO, type Point } from '../consts';
import { selectedTool, selectionSets } from '../main';
import { everyInIterable, getSetDifference, someInIterable } from '../utils/utils';
import { clearConnectTool, connectTool, handleElementClick, processConnectToolMode, replaceTargetAndProcess, type ConnectToolTarget } from '../utils/connectionTool';

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
    'CHANGE_ELEMENT_NAME': {
        element: LogicElement;
        oldName: string;
        newName: string;
    };
    // Один тип данных для двух экшенов
    'ADD_CONNECTIONS': { wires: Wire[] };
    'REMOVE_CONNECTIONS': { wires: Wire[] };
    'PASTE_ELEMENTS': { elements: LogicElement[], wires: Wire[] };
    'DUPLICATE_ELEMENTS': { elements: LogicElement[], wires: Wire[] };
    'ADD_SCHEME_FROM_FILE': { elements: LogicElement[], wires: Wire[] };
    'SELECTION_CLICK_CHANGE': { isAdded: boolean, element: LogicElement, key: SelectionSets };
    'SELECTION_CLICK_CLEAR': { element: LogicElement, elements: LogicElement[], key: SelectionSets };
    'SELECTIONS_CHANGE': {
        added: LogicElement[];
        removed: LogicElement[];
        key: SelectionSets;
    }[];
    'SELECTIONS_CLEAR': {
        elements: LogicElement[];
        key: SelectionSets;
        tool: ToolMode;
    }[];
    'CONNECT_TARGET_CHANGE': {
        mode: ConnectMode;
        oldTarget: ConnectToolTarget;
        newTarget: LogicElement | ElementPDO;
        index: number;
    };
    'CONNECT_TARGETS_CLEAR': {
        targets: ConnectToolTarget[];
        mode: ConnectMode;
    };
}
export type ActionType = keyof InverseData;

export interface HistoryAction<T extends ActionType> {
    type: T;
    data: InverseData[T];
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
    private selectionBackup: Record<SelectionSets, Set<LogicElement> | null> = {
        'selection': null,
        'source': null,
        'target': null
    };

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
                inverseDataSize = (action as HistoryAction<typeof action.type>).data.elements.length * 24;
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
                const { oldColors, newColor } = (action as HistoryAction<typeof action.type>).data;
                inverseDataSize =
                    oldColors.size * 16 + // entry: elementId(8) + color(8)
                    newColor.length;      // HEX-строка
                break;

            case 'CHANGE_GATE_TYPE':
                const { oldTypes, newType } = (action as HistoryAction<typeof action.type>).data;
                inverseDataSize =
                    oldTypes.size * 16 + // entry: elementId(8) + type(8)
                    8;                   // newType
                break;

            case 'CHANGE_TIMER_DELAY':
                const { oldDelays, newDelay } = (action as HistoryAction<typeof action.type>).data;
                inverseDataSize =
                    oldDelays.size * 16 + // entry: elementId(8) + delay(8)
                    8;                    // newDelay
                break;

            case 'ADD_CONNECTIONS':
            case 'REMOVE_CONNECTIONS':
                inverseDataSize = (action as HistoryAction<typeof action.type>).data.wires.length * 16;
                break;

            case 'SELECTION_CLICK_CHANGE':
                inverseDataSize = 8;
                break;

            case 'SELECTION_CLICK_CLEAR':
                const { elements } = (action as HistoryAction<typeof action.type>).data;
                inverseDataSize = 8 + elements.length * 8;
                break;

            case 'SELECTIONS_CHANGE':
                inverseDataSize = 8;
                for (const data of (action as HistoryAction<typeof action.type>).data) {
                    const { added, removed } = data;
                    inverseDataSize += (added.length + removed.length) * 8;
                }
                break;

            case 'SELECTIONS_CLEAR':
                inverseDataSize = 16;
                for (const data of (action as HistoryAction<typeof action.type>).data) {
                    const { elements } = data;
                    inverseDataSize += elements.length * 8;
                }
                break;

            case 'CONNECT_TARGET_CHANGE':
                inverseDataSize = 24;
                break;

            case 'CONNECT_TARGETS_CLEAR':
                inverseDataSize = (action as HistoryAction<typeof action.type>).data.targets.length * 8;
                break;
            
            case 'CHANGE_ELEMENT_NAME':
                const act = (action as HistoryAction<typeof action.type>);
                inverseDataSize = act.data.oldName.length * 8
                    + act.data.newName.length * 8
                    + 8;
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
            CHANGE_ELEMENT_NAME: 'Изменение имени элемента',
            ADD_CONNECTIONS: 'Добавление соединений',
            REMOVE_CONNECTIONS: 'Удаление соединений',
            PASTE_ELEMENTS: 'Вставка элементов',
            DUPLICATE_ELEMENTS: 'Дублирование элементов',
            ADD_SCHEME_FROM_FILE: 'Добавление схемы из файла',
            SELECTION_CLICK_CHANGE: 'Изменение выделения кликом',
            SELECTION_CLICK_CLEAR: 'Очистка выделения кликом',
            SELECTIONS_CHANGE: 'Изменение выделения',
            SELECTIONS_CLEAR: 'Очистка выделения',
            CONNECT_TARGET_CHANGE: 'Изменение при векторном соединении',
            CONNECT_TARGETS_CLEAR: 'Очистка при векторном соединении',
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
            data: inverseData,
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
        const prevMove = this.peekUndoAction();
        if (prevMove?.type === 'MOVE_ELEMENTS') {
            (prevMove as HistoryAction<'MOVE_ELEMENTS'>).data.deltaX += deltaX;
            (prevMove as HistoryAction<'MOVE_ELEMENTS'>).data.deltaY += deltaY;
        }
        else this.pushAction('MOVE_ELEMENTS', { deltaX, deltaY });
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
        if (oldTypes.size === 0) return;
        this.pushAction('CHANGE_GATE_TYPE', { oldTypes, newType });
    }

    recordChangeTimerDelay(oldDelays: Map<Timer, number>, newDelay: number): void {
        if (oldDelays.size === 0) return;
        this.pushAction('CHANGE_TIMER_DELAY', { oldDelays, newDelay });
    }

    recordChangeElementName(element: LogicElement, newName: string) {
        const lastAction = this.peekUndoAction() as HistoryAction<'CHANGE_ELEMENT_NAME'> | undefined;
        if (
            lastAction !== undefined &&
            lastAction.type === 'CHANGE_ELEMENT_NAME' &&
            lastAction.data.element === element
        ) {
            lastAction.data.newName = newName;
        } else {
            this.pushAction('CHANGE_ELEMENT_NAME', { element, newName, oldName: element.name });
        }
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

    recordSelectionClickChange(isAdded: boolean, element: LogicElement, key: SelectionSets): void {
        this.pushAction('SELECTION_CLICK_CHANGE', { isAdded, element, key });
    }

    recordSelectionClickClear(element: LogicElement, key: SelectionSets): void {
        this.pushAction('SELECTION_CLICK_CLEAR', { element, elements: [...selectionSets[key]], key });
    }

    recordSelectionsChange(keys: SelectionSets[]): void {
        const data = [];
        for (const key of keys) {
            const selection = selectionSets[key];
            const selectionBackup = this.selectionBackup[key];
            let added: LogicElement[];
            let removed: LogicElement[];
            if (selection.size === 0) {
                if (selectionBackup && selectionBackup.size > 0) {
                    added = [];
                    removed = [...selectionBackup];
                } else continue;
            } else if (!selectionBackup || selectionBackup.size === 0) {
                added = [...selection];
                removed = [];
            } else {
                added = getSetDifference(selection, selectionBackup);
                removed = getSetDifference(selectionBackup, selection);
            }

            if (added.length === 0 && removed.length === 0) continue;
            data.push({ added, removed, key });
        }
        if (data.length === 0) return;
        this.pushAction('SELECTIONS_CHANGE', data);
    }

    recordSelectionsClear(tool: ToolMode, keys: SelectionSets[]): void {
        const data = [];
        for (const key of keys) {
            const selection = selectionSets[key];
            if (selection.size === 0) continue;
            data.push({ elements: [...selection], key, tool });
        }
        if (data.length === 0) return;
        this.pushAction('SELECTIONS_CLEAR', data);
    }

    recordConnectTargetChange(oldTarget: ConnectToolTarget, newTarget: LogicElement, index: number, mode: ConnectMode): void {
        if (oldTarget === newTarget) return;
        this.pushAction('CONNECT_TARGET_CHANGE', { oldTarget, newTarget, index, mode });
    }

    recordConnectTargetsClear(targets: ConnectToolTarget[], mode: ConnectMode): void {
        if (!someInIterable(targets, (el) => el !== null)) return;
        this.pushAction('CONNECT_TARGETS_CLEAR', { targets: new Array(...targets), mode });
    }


    // === Selection ===
    pushSelectionsState(keys: SelectionSets[]): void {
        for (const key of keys) {
            this.selectionBackup[key] = selectionSets[key].size > 0 ? new Set(selectionSets[key]) : null;
        }
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
            case 'CHANGE_ELEMENT_NAME':
                this.executeChangeElementName(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'ADD_CONNECTIONS':
            case 'REMOVE_CONNECTIONS':
                this.executeConnections(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'SELECTION_CLICK_CHANGE':
                this.executeSelectionClickChange(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'SELECTION_CLICK_CLEAR':
                this.executeSelectionClickClear(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'SELECTIONS_CHANGE':
                this.executeSelectionsChange(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'SELECTIONS_CLEAR':
                this.executeSelectionsClear(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'CONNECT_TARGET_CHANGE':
                this.executeConnectTargetChange(action as HistoryAction<typeof action.type>, isUndo);
                break;
            case 'CONNECT_TARGETS_CLEAR':
                this.executeConnectTargetsClear(action as HistoryAction<typeof action.type>, isUndo);
                break;
            default: {
                const _exhaustive: never = action.type;
                console.warn(`Unknown action type in executeAction: ${_exhaustive}`);
            }
        }
    }
    private executeChangeElementName(action: HistoryAction<"CHANGE_ELEMENT_NAME">, isUndo: boolean) {
        const { element, oldName, newName } = action.data;
        element.name = isUndo ? oldName : newName;
    }

    private executeAddRemoveElements<T extends 'ADD_ELEMENTS' | 'PASTE_ELEMENTS' | 'DUPLICATE_ELEMENTS' | 'ADD_SCHEME_FROM_FILE' | 'REMOVE_ELEMENTS'>(
        action: HistoryAction<T>, isUndo: boolean): void {
        if ((action.type === 'REMOVE_ELEMENTS') === isUndo) {
            // Сначала добавляем элементы обратно в чанки
            for (const el of action.data.elements) {
                this.circuit.addExitstingElement(el);
            }
            // Затем восстанавливаем провода
            for (const wire of action.data.wires) {
                this.circuit.addWire(wire.src, wire.dst);
            }
        } else {
            for (const el of action.data.elements) {
                this.circuit.removeWiresForElement(el);
                this.circuit.deleteElement(el);
            }
        }
    }

    private executeMoveElements(action: HistoryAction<'MOVE_ELEMENTS'>, isUndo: boolean): void {
        const { deltaX, deltaY } = action.data;

        const mul = isUndo ? -1 : 1;
        for (const el of selectionSets['selection']) {
            this.circuit.moveElementBy(el, { x: deltaX * mul, y: deltaY * mul });
        }
    }

    private executeRotateElements<T extends 'ROTATE_ELEMENTS'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { center, clockwise } = action.data;

        const actualClockwise = isUndo ? !clockwise : clockwise;
        this.circuitIO.rotateSelected(selectionSets['selection'], actualClockwise, center);
    }

    private executeFlipElements<T extends 'FLIP_ELEMENTS'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { center, vertical } = action.data;

        this.circuitIO.flipSelected(selectionSets['selection'], vertical, center);
    }

    private executeChangeColor<T extends 'CHANGE_COLOR'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldColors, newColor } = action.data;

        for (const [el, oldColor] of oldColors.entries()) {
            el.color = isUndo ? oldColor : newColor;
        }
    }

    private executeChangeGateType<T extends 'CHANGE_GATE_TYPE'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldTypes, newType } = action.data;

        for (const [el, oldType] of oldTypes.entries()) {
            el.gateType = isUndo ? oldType : newType;
        }
    }

    private executeChangeTimerDelay<T extends 'CHANGE_TIMER_DELAY'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldDelays, newDelay } = action.data;

        for (const [el, oldDelay] of oldDelays.entries()) {
            el.setDelay(isUndo ? oldDelay : newDelay);
        }
    }

    private executeConnections<T extends 'ADD_CONNECTIONS' | 'REMOVE_CONNECTIONS'>(action: HistoryAction<T>, isUndo: boolean): void {
        for (const wire of action.data.wires) {
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

    private executeSelectionClickChange<T extends 'SELECTION_CLICK_CHANGE'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { isAdded, element, key } = action.data;
        if (isUndo === isAdded) {
            selectionSets[key].delete(element);
        } else {
            selectionSets[key].add(element);
        }
    }

    private executeSelectionClickClear<T extends 'SELECTION_CLICK_CLEAR'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { elements, element, key } = action.data;
        if (isUndo) {
            selectionSets[key].delete(element);
            elements.forEach((el) => selectionSets[key].add(el));
        } else {
            selectionSets[key].clear();
            selectionSets[key].add(element);
        }
    }

    private executeSelectionsChange<T extends 'SELECTIONS_CHANGE'>(action: HistoryAction<T>, isUndo: boolean): void {
        for (const data of action.data) {
            const { added, removed, key } = data;
            const toRemove = isUndo ? added : removed;
            const toAdd = isUndo ? removed : added;

            toRemove.forEach((el) => selectionSets[key].delete(el));
            toAdd.forEach((el) => selectionSets[key].add(el));
        }
    }

    private executeSelectionsClear<T extends 'SELECTIONS_CLEAR'>(action: HistoryAction<T>, isUndo: boolean): void {
        for (const data of action.data) {
            const { elements, key } = data;

            if (isUndo)
                elements.forEach((el) => selectionSets[key].add(el));
            else
                selectionSets[key].clear();
        }
    }

    private executeConnectTargetChange<T extends 'CONNECT_TARGET_CHANGE'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { oldTarget, newTarget, index } = action.data;
        const toRemove = isUndo ? newTarget : oldTarget;
        const toAdd = isUndo ? oldTarget : newTarget;
        replaceTargetAndProcess(index, toAdd);
        // connectTool.targets[index] = toAdd;
        // processConnectToolMode();
        // if (toRemove !== null) handleElementClick(toRemove, index);
        // if (toAdd !== null) handleElementClick(toAdd, index);
    }

    private executeConnectTargetsClear<T extends 'CONNECT_TARGETS_CLEAR'>(action: HistoryAction<T>, isUndo: boolean): void {
        const { targets } = action.data;
        if (isUndo) {
            connectTool.targets.splice(0, targets.length, ...targets);
        } else {
            clearConnectTool();
        }
        processConnectToolMode();

    }
    // === Утилиты ===

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        SelectionSets.forEach(key => this.selectionBackup[key] = null);
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

    peekUndoAction(): HistoryAction<ActionType> | undefined {
        return this.undoStack.at(this.undoStack.length - 1);
    }

    peekRedoAction(): HistoryAction<ActionType> | undefined {
        return this.redoStack.at(this.redoStack.length - 1);
    }

    peekUndoActionType(): ActionType | undefined {
        return this.undoStack.at(this.undoStack.length - 1)?.type;
    }

    peekRedoActionType(): ActionType | undefined {
        return this.redoStack.at(this.redoStack.length - 1)?.type;
    }
}