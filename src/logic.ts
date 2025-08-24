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

export class Pair<T1, T2> {
    first: T1;
    second: T2;
    constructor(
        first: T1,
        second: T2
    ) {
        this.first = first;
        this.second = second;
    }
}
export class BitArray {
    length: number;
    buffer: Uint32Array;
    constructor(capacity: number) {
        this.length = 0;
        this.buffer = new Uint32Array(Math.max(Math.ceil(capacity / 32) || 0, 4));
    }

    push(value: boolean) {
        let row = Math.trunc(this.length / 32);
        if (this.buffer.length < row) {
            this.buffer = new Uint32Array(this.buffer.buffer, 0, row + 2);
        }
        this.buffer[row] |= Number(value) << (this.length % 32);
        ++this.length;
    }

    at(index: number) {
        let row = Math.trunc(index / 32);
        let col = index % 32;
        return Boolean((this.buffer[row] >> col) & 1);
    }

    setAt(index: number, value: boolean) {
        let row = Math.trunc(index / 32);
        let col = index % 32;
        if (row > this.buffer.length)
            throw RangeError(`Buffer length is ${this.buffer.length}, but row is ${row}`);
        if ((this.buffer[row] >> col & 1) != (Number(value) & 1))
            this.buffer[row] ^= 1 << col;
    }

    resize(size: number) {
        let newCapacity = Math.ceil(size / 32);
        this.buffer = new Uint32Array(this.buffer.buffer, 0, newCapacity);
        this.length = Math.min(this.length, size);
    }

    shift(value: boolean) {
        let nextValue = Number(value ?? 0);
        for (let i = this.buffer.length; i-- != 0;) {
            let lastBit = this.buffer[i] & 1;
            this.buffer[i] = (this.buffer[i] >>> 1) | nextValue << 31;
            nextValue = lastBit;
        }
        --this.length;
        return nextValue;
    }

    unshift(value: boolean, resize = false) {
        let nextValue = Number(value ?? 0);
        if (!resize)
            this.length = Math.max(this.length + 1, (this.buffer.length << 5) - 1);
        else
            ++this.length;
        if (resize && (this.length > this.buffer.length * 32))
            this.buffer = new Uint32Array(this.buffer.buffer, 0, this.buffer.length << 1);
        for (let i = 0; i < this.buffer.length; ++i) {
            let lastBit = (this.buffer[i] >>> 31) & 1;
            this.buffer[i] = (this.buffer[i] << 1) | nextValue;
            nextValue = lastBit;
        }

        return nextValue;
    }

}


let nextId = 1;

export class LogicElement {
    setValue(_: boolean) { throw new Error("Method not implemented."); }
    eval() { throw new Error("Method not implemented."); };
    getController(): Object | null { return null; };
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
        this.inputs = new Set();
        this.outputs = new Set();
    }

    addInput(element: LogicElement) {
        this.inputs.add(element);
        element.outputs.add(this);
    }

    removeInput(element: LogicElement) {
        this.inputs.delete(element);
        element.outputs.delete(this);
    }

    computeNextValue() {
        this.nextValue = this.value;
    }

    applyNextValue() {
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
                this.nextValue = this.inputs.size > 0 && everyInIterable(this.inputs, (input => input.value));
                break;
            case 1: // OR
                this.nextValue = someInIterable(this.inputs, (input => input.value));
                break;
            case 6:
            case 2: // XOR
                if (this.inputs.size === 0) {
                    this.nextValue = false;
                } else {
                    this.nextValue = countInIterable(this.inputs, (el => el.value === true)) % 2 === 1;
                }
                break;
            case 3: // NAND
                this.nextValue = this.inputs.size > 0 && !everyInIterable(this.inputs, (input => input.value));
                break;
            case 4: // NOR
                this.nextValue = this.inputs.size > 0 && !someInIterable(this.inputs, (input => input.value));
                break;
            case 5: // XNOR
                if (this.inputs.size === 0) {
                    this.nextValue = false;
                } else {
                    this.nextValue = countInIterable(this.inputs, (el => el.value === true)) % 2 === 0;
                }
                break;
            default:
                this.nextValue = false;
        }
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
        this.nextValue = this.buffer.at(this.delay);
        this.buffer.unshift(someInIterable(this.inputs, (input => input.value)) || false);
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
        this.value = val;
        this.nextValue = false;
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
        this.nextValue = this.inputs.size > 0 ? someInIterable(this.inputs, (input => input.value)) : false;
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
    wires: Map<string, Wire>;
    tick: number;
    constructor() {
        this.elements = new Set();
        this.wires = new Map(); // Используем Set вместо массива
        this.tick = 0;
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
        if (this.tick === 10000)
            this.tick %= 10000;
        this.tick++;
        // Фаза 1: вычисление новых состояний
        for (const el of this.elements) {
            el.eval();
        }

        // Фаза 2: применение новых состояний
        for (const el of this.elements) {
            el.applyNextValue();
        }
    }

    reset() {
        for (const el of this.elements) {
            if (isInputElement(el)) {
                el.setValue(false);
            } else {
                el.value = false;
                el.nextValue = false;
            }
        }
        this.tick = 0;
    }
    clear() {
        this.elements.clear();
        this.wires.clear();
        this.tick = 0;
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
