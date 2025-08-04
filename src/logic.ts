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
    setValue(val: boolean) { throw new Error("Method not implemented."); }
    eval() { throw new Error("Method not implemented."); };
    id: number;
    type: string;
    x: number;
    y: number;
    inputs: Set<LogicElement>;
    outputs: Set<LogicElement>;
    value: boolean;
    nextValue: boolean;
    constructor(type: string, x: number, y: number) {
        this.id = nextId++;
        this.type = type;
        this.x = x;
        this.y = y;
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
const gateType = new Map<string, number>(Object.entries({
    'AND': 0,
    'OR': 1,
    'XOR': 2,
    'NAND': 3,
    'NOR': 4,
    'XNOR': 5,
}));
export class LogicGate extends LogicElement {
    gateType: number;

    constructor(type: string, x: number, y: number) {
        super(type, x, y);
        this.gateType = gateType.get(type) || 0;
    }

    eval() {
        switch (this.gateType) {
            case 0: // AND
                this.nextValue = this.inputs.size > 0 && everyInIterable(this.inputs, (input => input.value));
                break;
            case 1: // OR
                this.nextValue = someInIterable(this.inputs, (input => input.value));
                break;
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
}
export class TFlop extends LogicElement {
    gateType: number;
    constructor(x: number, y: number) {
        super('T_FLOP', x, y);
        this.gateType = 2;
    }

    eval() {
        // T-триггер: меняет состояние при true на входе
        if (this.nextValue = countInIterable(this.inputs, (el => el.value === true)) % 2 === 1) {
            this.nextValue = !this.value;
        } else {
            this.nextValue = this.value;
        }
    }
}

export class Timer extends LogicElement {
    delay: number;
    buffer: BitArray;
    constructor(x: number, y: number) {
        super('TIMER', x, y);
        this.delay = 0;
        this.buffer = new BitArray(128);

    }

    setDelay(val: number) {
        this.delay = val;
    }

    eval() {
        this.nextValue = this.buffer.at(this.delay);
        this.buffer.unshift(someInIterable(this.inputs, (input => input.value)) || false);
    }
}

export class Button extends LogicElement {
    constructor(x: number, y: number) {
        super('BUTTON', x, y);
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
}

export class Switch extends LogicElement {
    constructor(x: number, y: number) {
        super('SWITCH', x, y);
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
}

export class OutputElement extends LogicElement {
    constructor(x: number, y: number) {
        super('OUTPUT', x, y);
    }

    eval() {
        // Выход просто отражает первый вход (если есть)
        this.nextValue = this.inputs.size > 0 ? someInIterable(this.inputs, (input => input.value)) : false;
    }
}

export class Wire {
    from: LogicElement;
    to: LogicElement;
    constructor(from: LogicElement, to: LogicElement) {
        this.from = from;
        this.to = to;
    }
}

export class Circuit {
    elements: LogicElement[];
    wires: Map<string, Wire>;
    tick: number;
    constructor() {
        this.elements = [];
        this.wires = new Map(); // Используем Set вместо массива
        this.tick = 0;
    }

    addElement(el: LogicElement) {
        this.elements.push(el);
        return el;
    }

    addWire(from: LogicElement, to: LogicElement) {
        // Проверяем, нет ли уже такого провода
        const wireKey = `${from.id}-${to.id}`;
        const reverseWireKey = `${to.id}-${from.id}`;


        if (this.wires.has(wireKey) || this.wires.has(reverseWireKey))
            return false;


        this.wires.set(wireKey, new Wire(from, to));
        to.addInput(from);
        return true;
    }

    removeWire(from: { id: any; }, to: { id: any; removeInput: (arg0: any) => void; }) {
        const wireKey = `${from.id}-${to.id}`;

        if (this.wires.has(wireKey)) {
            this.wires.delete(wireKey);
            to.removeInput(from);
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
            wire.first.to.removeInput(wire.first.from);
            this.wires.delete(wire.second);
        }
    }

    step() {
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
    TFlop,
    Timer,
    Button,
    Switch,
    OutputElement,
    Circuit,
    isOutputElement,
    isInputElement
};
