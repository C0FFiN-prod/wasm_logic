import { BitArray, Pair, Queue } from "./dataStructs";

// logic.js
export type ComparatorFunc<T> = (params: T) => boolean;

export function countInIterable<T>(iterable: Iterable<T>, query: ComparatorFunc<T>) {
    let count = 0;
    for (const el of iterable) {
        if (query(el)) {
            count++;
        }
    }
    return count;
}

export function everyInIterable<T>(iterable: Iterable<T>, query: ComparatorFunc<T>) {
    for (const el of iterable) {
        if (!query(el)) {
            return false;
        }
    }
    return true;
}

export function someInIterable<T>(iterable: Iterable<T>, query: ComparatorFunc<T>) {
    for (const el of iterable) {
        if (query(el)) {
            return true;
        }
    }
    return false;
}



let nextId = 1;

export class LogicElement {
    setValue(_: boolean) { throw new Error("Method not implemented."); }
    eval() { throw new Error("Method not implemented."); };
    getController(): Record<string, any> | null { return null; };
    id: number;
    type: string;
    x: number;
    y: number;
    z: number;
    xaxis: number;
    zaxis: number;
    color: string;
    inputs: Set<LogicElement>;
    outputs: Set<LogicElement>;
    value: boolean;
    nextValue: boolean;
    cnt: number;
    nextCnt: number;
    constructor(type: string, x: number, y: number, z = 0, xaxis = 1, zaxis = 1, color = "222222") {
        this.id = nextId++;
        this.type = type;
        this.x = x;
        this.y = y;
        this.z = z;
        this.xaxis = xaxis;
        this.zaxis = zaxis;
        this.color = color;
        this.value = false;
        this.nextValue = false;
        this.cnt = 0;
        this.nextCnt = 0;
        this.inputs = new Set();
        this.outputs = new Set();
    }

    addInput(element: LogicElement) {
        this.inputs.add(element);
        element.outputs.add(this);
        if (element.value) { this.cnt++; this.nextCnt++; }
    }

    removeInput(element: LogicElement) {
        this.inputs.delete(element);
        element.outputs.delete(this);
        if (element.value) { this.cnt--; this.nextCnt--; }
    }

    applyNextValue() {
        let change = 0
        if (this.value) change = -1;
        else change = 1;
        for (const output of this.outputs) {
            output.nextCnt += change;
        }
        this.value = this.nextValue;
    }



}

export class LogicGate extends LogicElement {
    gateType: number;

    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", mode = 0) {
        super('GATE', x, y, z, xaxis, zaxis, color);
        this.gateType = mode;
    }

    eval() {
        switch (this.gateType) {
            case 0: // AND
                this.nextValue = this.cnt === this.inputs.size;
                break;
            case 1: // OR
                this.nextValue = this.cnt > 0;
                break;
            case 6:
            case 2: // XOR
                this.nextValue = this.cnt % 2 === 1;
                break;
            case 3: // NAND
                this.nextValue = this.cnt !== this.inputs.size;
                break;
            case 4: // NOR
                this.nextValue = this.cnt === 0;
                break;
            case 5: // XNOR
                this.nextValue = this.cnt % 2 === 0;
                break;
            default:
                this.nextValue = false;
        }
        this.nextValue = this.nextValue && this.inputs.size > 0;
    }

    getController() {
        return this.gateType === 6 ? {
            active: false,
            controllers: [...this.outputs, this].map(el => ({ id: el.id })),
            id: this.id,
            joints: null,
            mode: 2
        } : {
            active: false,
            controllers: Array.from(this.outputs).map(el => ({ id: el.id })),
            id: this.id,
            joints: null,
            mode: this.gateType
        }
    }
}

export class Timer extends LogicElement {
    delay: number;
    buffer: BitArray;
    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", seconds = 0, ticks = 0) {
        super('TIMER', x, y, z, xaxis, zaxis, color);
        this.delay = Math.max(seconds * 40 + ticks, 0);
        this.buffer = new BitArray(128);

    }

    setDelay(val: number) {
        this.delay = val;
    }

    eval() {
        this.buffer.unshift(this.cnt > 0);
        this.nextValue = this.buffer.at(this.delay);
    }

    getController() {
        return {
            active: false,
            controllers: Array.from(this.outputs).map(el => ({ id: el.id })),
            id: this.id,
            joints: null,
            seconds: Math.floor(this.delay / 40),
            ticks: this.delay % 40
        }
    }
}

export class Button extends LogicElement {
    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222") {
        super('BUTTON', x, y, z, xaxis, zaxis, color);
        this.value = false;
        this.nextValue = false;
    }

    setValue(val: boolean) {
        if (val !== this.value) {
            let change = 0
            if (this.value) change = -1;
            else change = 1;
            for (const output of this.outputs) {
                output.cnt += change;
                output.nextCnt += change;
            }
        }
        this.value = val;
        this.nextValue = val;
    }

    eval() {
        // Входные элементы не изменяют свое значение автоматически
        this.nextValue = false;
    }

    getController() {
        return {
            active: false,
            controllers: Array.from(this.outputs).map(el => ({ id: el.id })),
            id: this.id,
            joints: null
        }
    }
}

export class Switch extends LogicElement {
    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222") {
        super('SWITCH', x, y, z, xaxis, zaxis, color);
        this.value = false;
        this.nextValue = false;
    }

    setValue(val: boolean) {
        if (val !== this.value) {
            let change = 0
            if (this.value) change = -1;
            else change = 1;
            for (const output of this.outputs) {
                output.cnt += change;
                output.nextCnt += change;
            }
        }
        this.value = val;
        this.nextValue = val;
    }

    eval() {
        // Входные элементы не изменяют свое значение автоматически
        this.nextValue = this.value;
    }
    getController() {
        return {
            active: false,
            controllers: Array.from(this.outputs).map(el => ({ id: el.id })),
            id: this.id,
            joints: null
        }
    }
}

export class OutputElement extends LogicElement {
    luminance: number;

    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", luminance = 50) {
        super('OUTPUT', x, y, z, xaxis, zaxis, color);
        this.luminance = luminance
    }

    eval() {
        // Выход просто отражает первый вход (если есть)
        this.nextValue = this.inputs.size > 0 && this.cnt > 0;
    }

    getController() {
        return {
            controllers: null,
            id: this.id,
            joints: null,
            coneAngle: 0,
            color: this.color,
            luminance: this.luminance
        }
    }
}

export class Wire {
    src: LogicElement;
    dst: LogicElement;
    constructor(src: LogicElement, dst: LogicElement) {
        this.src = src;
        this.dst = dst;
    }
}

export class Circuit {
    elements: Set<LogicElement>;
    pendingElements: Queue<LogicElement>;
    affectedElements: Set<LogicElement>;
    wires: Map<string, Wire>;
    constructor() {
        this.elements = new Set();
        this.pendingElements = new Queue();
        this.affectedElements = new Set();
        this.wires = new Map();
    }

    addElement(type: string, params: Record<string, any>) {
        let el: LogicElement;
        switch (type) {
            case 'GATE':
                el = new LogicGate(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, params.controller.mode);
                if (params.controller.mode === 6) {
                    this.addWire(el, el);
                }
                break;
            case 'TIMER':
                el = new Timer(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color);
                break;
            case 'BUTTON':
                el = new Button(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color);
                break;
            case 'SWITCH':
                el = new Switch(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color);
                break;
            case 'OUTPUT':
                el = new OutputElement(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, params.controller.luminance);
                break;
            default:
                return null;
        }

        this.elements.add(el);
        return el;
    }

    addWire(src: LogicElement, dst: LogicElement) {
        // Проверяем, нет ли уже такого провода
        const wireKey = `${src.id}-${dst.id}`;
        const reverseWireKey = `${dst.id}-${src.id}`;


        if (this.wires.has(wireKey) || this.wires.has(reverseWireKey))
            return false;


        this.wires.set(wireKey, new Wire(src, dst));
        dst.addInput(src);
        return true;
    }

    removeWire(src: { id: any; }, dst: { id: any; removeInput: (arg0: any) => void; }) {
        const wireKey = `${src.id}-${dst.id}`;

        if (this.wires.has(wireKey)) {
            this.wires.delete(wireKey);
            dst.removeInput(src);
            return true;
        }

        return false;
    }

    // Удалить все провода, связанные с элементом
    removeWiresForElement(element: { id: any; inputs: any; }) {
        const wiresToRemove = new Array<Pair<Wire, string>>();

        // Сначала находим все провода для удаления
        const elID = element.id;
        let wire, key: string;
        for (const el of this.elements) {
            if ((wire = this.wires.get(key = `${elID}-${el.id}`)) !== undefined)
                wiresToRemove.push(new Pair(wire, key));
        }

        for (const el of element.inputs) {
            if (wire = this.wires.get(key = `${el.id}-${elID}`)) {
                wiresToRemove.push(new Pair(wire, key));
            }
        }

        // Затем удаляем их
        for (const wire of wiresToRemove) {
            wire.first.dst.removeInput(wire.first.src);
            this.wires.delete(wire.second);
        }
    }

    step() {
        // Фаза 1: вычисление новых состояний
        for (const el of this.elements) {
            el.eval();
            if (el.nextValue !== el.value) this.pendingElements.push(el);
        }

        // Фаза 2: применение новых состояний
        let el: LogicElement | undefined;
        this.affectedElements.clear();
        while ((el = this.pendingElements.pop()) !== undefined) {
            el.applyNextValue();
            el.outputs.forEach(output => this.affectedElements.add(output));
        }

        for (const el of this.affectedElements) {
            el.cnt = el.nextCnt;
        }
    }

    reset() {
        for (const el of this.elements) {
            el.value = false;
            el.nextValue = false;
        }
    }
    clear() {
        this.pendingElements.resize(16);
        this.affectedElements.clear();
        this.elements.clear();
        this.wires.clear();
        nextId = 0;
    }
}

export function isOutputElement(el: LogicElement): boolean {
    return el && el.type === 'OUTPUT';
}

export function isInputElement(el: LogicElement): boolean {
    return el && (el instanceof Button || el instanceof Switch);
}
// Экспортируем классы для main.js


export const LogicGates = {
    Pair,
    BitArray,
    LogicGate,
    Timer,
    Button,
    Switch,
    OutputElement,
    Circuit,
    isOutputElement,
    isInputElement
};
