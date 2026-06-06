import { chunkSize, type Point } from "./consts";
import { BitArray, LRU, Pair } from "./dataStructs";
import { getChunkKey } from "./utils/utils";

let nextId = 1;

export class LogicElement {
    setValue(_: boolean) { throw new Error("Method not implemented."); }
    eval() { throw new Error("Method not implemented."); };
    getController(): Record<string, any> | null { return null; };
    deleted = false;
    id: number;
    name: string;
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
    constructor(type: string, x: number, y: number, z = 0, xaxis = 1, zaxis = 1, color = "222222", name?: string) {
        this.id = nextId++;
        this.name = name ?? this.id.toString();
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
        this.inputs = new Set();
        this.outputs = new Set();
    }

    addInput(element: LogicElement) {
        this.inputs.add(element);
        element.outputs.add(this);
        if (element.value) { this.cnt++; }
    }

    removeInput(element: LogicElement) {
        this.inputs.delete(element);
        element.outputs.delete(this);
        if (element.value) { this.cnt--; }
    }

    applyNextValue() {
        let change = 0
        if (this.value) change = -1;
        else change = 1;
        for (const output of this.outputs) {
            output.cnt += change;
        }
        this.value = this.nextValue;
    }



}

export class LogicGate extends LogicElement {
    gateType: number;

    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", mode = 0, name?: string) {
        super('GATE', x, y, z, xaxis, zaxis, color, name);
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
    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", seconds = 0, ticks = 0, name?: string) {
        super('TIMER', x, y, z, xaxis, zaxis, color, name);
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
    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", name?: string) {
        super('BUTTON', x, y, z, xaxis, zaxis, color, name);
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
            }
        }
        this.value = val;
        this.nextValue = val;
    }

    eval() {
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
    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", name?: string) {
        super('SWITCH', x, y, z, xaxis, zaxis, color, name);
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
            }
        }
        this.value = val;
        this.nextValue = val;
    }

    eval() {
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

    constructor(x: number, y: number, z = 0, xaxis = 0, zaxis = 0, color = "222222", luminance = 50, name?: string) {
        super('OUTPUT', x, y, z, xaxis, zaxis, color, name);
        this.luminance = luminance
    }

    eval() {
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
export type Chunk = { version: number, data: Set<LogicElement> };
export class Circuit {
    chunks: Map<string, Chunk>;
    lruChunkCache: LRU<string>;

    public get size(): number {
        return this._size;
    }
    private _size: number = 0;
    pendingCnt: number = 0;
    pendingElements: LogicElement[];
    wires: Map<string, Wire>;
    constructor() {
        this.chunks = new Map();
        this.lruChunkCache = new LRU();
        this.pendingElements = [];
        this.wires = new Map();
    }
    addExitstingElement(el: LogicElement) {
        this.getOrCreateChunk(el).data.add(el);
        el.deleted = false;
        ++this._size;
    }
    addElement(type: string, params: Record<string, any>, affectedChunk: {dst: Chunk | undefined} | null = null) {
        let el: LogicElement;
        switch (type) {
            case 'GATE':
                el = new LogicGate(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, params.controller.mode, params.name);
                if (params.controller.mode === 6) {
                    this.addWire(el, el);
                }
                break;
            case 'TIMER':
                el = new Timer(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, (params.controller.seconds ?? 0), (params.controller.ticks ?? 0), params.name);
                break;
            case 'BUTTON':
                el = new Button(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, params.name);
                break;
            case 'SWITCH':
                el = new Switch(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, params.name);
                break;
            case 'OUTPUT':
                el = new OutputElement(params.pos.x, params.pos.y, params.pos.z, params.xaxis, params.zaxis, params.color, params.controller.luminance, params.name);
                break;
            default:
                return null;
        }
        const chunk = this.getOrCreateChunk(el);
        if (affectedChunk) affectedChunk.dst = chunk;
        chunk.data.add(el);
        ++this._size;
        return el;
    }

    private getOrCreateChunk(element: Point) {
        const key = getChunkKey(element, true);
        if (!this.chunks.has(key))
            this.chunks.set(key, { version: 1, data: new Set()});
        this.lruChunkCache.access(key);
        return this.chunks.get(key)!;
    }

    getChunk(point: Point, doDivide: boolean) {
        const key = getChunkKey(point, doDivide);
        const chunk = this.chunks.get(key);
        if (chunk) this.lruChunkCache.access(key);
        return chunk;
    }

    addWire(src: LogicElement, dst: LogicElement) {
        const wireKey = `${src.id}|${dst.id}`;

        if (this.wires.has(wireKey))
            return undefined;

        const wire = new Wire(src, dst);
        this.wires.set(wireKey, wire);
        dst.addInput(src);
        return wire;
    }

    removeWire(src: LogicElement, dst: LogicElement) {
        const wireKey = `${src.id}|${dst.id}`;
        let wire;
        if ((wire = this.wires.get(wireKey)) !== undefined) {
            this.wires.delete(wireKey);
            dst.removeInput(src);
            return wire;
        }

        return undefined;
    }

    removeWiresForElement(element: LogicElement) {
        const wiresToRemove = new Array<Pair<Wire, string>>();

        const elID = element.id;
        let wire, key: string;
        for (const el of element.outputs) {
            if ((wire = this.wires.get(key = `${elID}|${el.id}`)) !== undefined)
                wiresToRemove.push(new Pair(wire, key));
        }

        for (const el of element.inputs) {
            if (wire = this.wires.get(key = `${el.id}|${elID}`)) {
                wiresToRemove.push(new Pair(wire, key));
            }
        }

        for (const wire of wiresToRemove) {
            wire.first.dst.removeInput(wire.first.src);
            this.wires.delete(wire.second);
        }
        return wiresToRemove.map(p => p.first);
    }

    step() {
        this.pendingCnt = 0;
        for (const chunk of this.chunks.values()) {
            for (const el of chunk.data) {
                el.eval();
                if (el.nextValue !== el.value) {
                    if (this.pendingElements.length <= this.pendingCnt) this.pendingElements.push(el);
                    else this.pendingElements[this.pendingCnt] = el;
                    ++this.pendingCnt;
                }
            }
        }

        for (let i = 0; i < this.pendingCnt; ++i) {
            this.pendingElements[i].applyNextValue();
        }
    }

    reset() {
        for (const chunk of this.chunks.values()) {
            for (const el of chunk.data) {
                el.value = false;
                el.nextValue = false;
            }
        }
    }
    clear() {
        this.pendingCnt = 0;
        this.pendingElements = [];
        this.wires.clear();
        this.chunks.clear();
        this.lruChunkCache.clear();
        nextId = 0;
    }
    moveElementTo(el: LogicElement, point: Point,
        affectedChunks: { src: Chunk | undefined, dst: Chunk | undefined } | null = null) {
        let { x, y } = el;
        x = Math.floor(x / chunkSize);
        y = Math.floor(y / chunkSize);
        el.x = point.x;
        el.y = point.y;
        if (x !== Math.floor(el.x / chunkSize) ||
            y !== Math.floor(el.y / chunkSize)) {
            const srcChunk = this.getChunk({ x, y }, false);
            srcChunk?.data.delete(el);
            const dstChunk = this.getOrCreateChunk(el);
            dstChunk.data.add(el);
            if (affectedChunks) {
                affectedChunks.src = srcChunk;
                affectedChunks.dst = dstChunk;
            }
        } else if (affectedChunks) {
            affectedChunks.src = undefined;
            affectedChunks.dst = this.getOrCreateChunk(el);;
        }
    }
    moveElementBy(el: LogicElement, delta: Point,
        affectedChunks: { src: Chunk | undefined, dst: Chunk | undefined } | null = null) {
        let { x, y } = el;
        x = Math.floor(x / chunkSize);
        y = Math.floor(y / chunkSize);
        el.x += delta.x;
        el.y += delta.y;
        if (x !== Math.floor(el.x / chunkSize) ||
            y !== Math.floor(el.y / chunkSize)) {
            const srcChunk = this.getChunk({ x, y }, false);
            srcChunk?.data.delete(el);
            const dstChunk = this.getOrCreateChunk(el);
            dstChunk.data.add(el);
            if (affectedChunks) {
                affectedChunks.src = srcChunk;
                affectedChunks.dst = dstChunk;
            }
        }else if (affectedChunks) {
            affectedChunks.src = undefined;
            affectedChunks.dst = this.getOrCreateChunk(el);;
        }
    }

    deleteElement(el: LogicElement) {
        const chunk = this.getChunk(el, true);
        if (chunk?.data.delete(el)) {
            --this._size;
            el.deleted = true;
            if (this._size < this.pendingElements.length) {
                this.pendingElements.length = this._size;
                this.pendingCnt = Math.min(this._size, this.pendingCnt);
            }
            return chunk;
        }
    }
}

export function isOutputElement(el: LogicElement): boolean {
    return el && el.type === 'OUTPUT';
}

export function isInputElement(el: LogicElement): boolean {
    return el && (el instanceof Button || el instanceof Switch);
}

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
