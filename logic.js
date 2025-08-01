// logic.js

Object.defineProperties(Array.prototype, {
    count: {
        value: function (query) {
            let count = 0;
            for (let i = 0; i < this.length; ++i)
                if (query(this[i]))
                    count++;
            return count;
        }
    }
});

class BitArray {
    constructor(size) {
        this.length = size ?? 0;
        this.buffer = new Uint32Array(Math.max(size ?? 0, 8));
    }

    push(value) {
        let row = Math.trunc(this.length / 32);
        if (this.buffer.length < row) this.buffer.push(0);
        this.buffer[row] |= value << (this.length % 32);
        ++this.length;
    }

    at(index) {
        let row = Math.trunc(index / 32);
        let col = index % 32;
        return Boolean((this.buffer[row] >> col) & 1);
    }

    setAt(index, value) {
        let row = Math.trunc(index / 32);
        let col = index % 32;
        if (row > this.buffer.length)
            throw RangeError(`Buffer length is ${this.buffer.length}, but row is ${row}`);
        if ((this.buffer[row] >> col & 1) != value & 1)
            this.buffer[row] ^= 1 << col;
    }

    resize(size) {
        let newCapacity = Math.ceil(size / 32);
        while (newCapacity > this.buffer.length)
            this.push(0);
        this.buffer.length = newCapacity;
        this.length = Math.min(this.length, size);
    }

    shift(value) {
        let nextValue = value ?? 0;
        for (let i = this.buffer.length; i-- != 0;) {
            let lastBit = this.buffer[i] & 1;
            this.buffer[i] = (this.buffer[i] >>> 1) | nextValue << 31;
            nextValue = lastBit;
        }
        --this.length;
        return nextValue;
    }

    unshift(value, resize = false) {
        let nextValue = value ?? 0;
        if (!resize)
            this.length = Math.max(this.length + 1, (this.buffer.length << 5) - 1);
        else
            ++this.length;
        if (resize && (this.length > this.buffer.length * 32))
            this.buffer = new Uint32Array(this.buffer, 0, this.buffer.length << 1);
        for (let i = 0; i < this.buffer.length; ++i) {
            let lastBit = (this.buffer[i] >>> 31) & 1;
            this.buffer[i] = (this.buffer[i] << 1) | nextValue;
            nextValue = lastBit;
        }

        return nextValue;
    }

}


(function () {
    let nextId = 1;

    class LogicElement {
        constructor(type, x, y) {
            this.id = nextId++;
            this.type = type;
            this.x = x;
            this.y = y;
            this.inputs = [];
            this.value = false;
            this.nextValue = false;

        }

        addInput(element) {
            this.inputs.push(element);
        }

        removeInput(element) {
            this.inputs = this.inputs.filter(input => input !== element);
        }

        computeNextValue() {
            this.nextValue = this.value;
        }

        applyNextValue() {
            this.value = this.nextValue;
        }
    }

    class LogicGate extends LogicElement {
        /**
         * @param {number} type 0=AND, 1=OR, 2=XOR, 3=NAND, 4=NOR, 5=XNOR
         * @param {number} x
         * @param {number} y
         */
        constructor(type, x, y) {
            const typeNames = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR'];
            super(typeNames[type], x, y);
            this.gateType = type;
        }

        eval() {
            switch (this.gateType) {
                case 0: // AND
                    this.nextValue = this.inputs.length > 0 && this.inputs.every(input => input.value);
                    break;
                case 1: // OR
                    this.nextValue = this.inputs.some(input => input.value);
                    break;
                case 2: // XOR
                    if (this.inputs.length === 0) {
                        this.nextValue = false;
                    } else {
                        this.nextValue = (this.inputs.count(el => el.value === true) % 2) === 1;
                    }
                    break;
                case 3: // NAND
                    this.nextValue = this.inputs.length > 0 && !this.inputs.every(input => input.value);
                    break;
                case 4: // NOR
                    this.nextValue = this.inputs.length > 0 && !this.inputs.some(input => input.value);
                    break;
                case 5: // XNOR
                    if (this.inputs.length === 0) {
                        this.nextValue = false;
                    } else {
                        this.nextValue = (this.inputs.count(el => el.value === true) % 2) === 0;
                    }
                    break;
                default:
                    this.nextValue = false;
            }
        }
    }
    class TFlop extends LogicElement {
        constructor(x, y) {
            super('T-FLOP', x, y);
            this.gateType = 2;
        }
        
        eval() {
            // T-триггер: меняет состояние при true на входе
            if (this.nextValue = (this.inputs.count(el => el.value === true) % 2) === 1) {
                this.nextValue = !this.value;
            } else {
                this.nextValue = this.value;
            }
        }
    }

    class Timer extends LogicElement {
        constructor(x, y) {
            super('TIMER', x, y);
            this.delay = 0;
            this.buffer = new BitArray();

        }

        setDelay(val) {
            this.delay = val;
        }

        eval() {
            this.nextValue = this.buffer.at(this.delay);
            this.buffer.unshift(this.inputs[0]?.value || false);
        }
    }

    class Button extends LogicElement {
        constructor(x, y) {
            super('BUTTON', x, y);
            this.value = false;
            this.nextValue = false;
        }

        setValue(val) {
            this.value = val;
            this.nextValue = false;
        }

        eval() {
            // Входные элементы не изменяют свое значение автоматически
            this.nextValue = false;
        }
    }

    class Switch extends LogicElement {
        constructor(x, y) {
            super('SWITCH', x, y);
            this.value = false;
            this.nextValue = false;
        }

        setValue(val) {
            this.value = val;
            this.nextValue = val;
        }

        eval() {
            // Входные элементы не изменяют свое значение автоматически
            this.nextValue = this.value;
        }
    }

    class OutputElement extends LogicElement {
        constructor(x, y) {
            super('OUTPUT', x, y);
        }

        eval() {
            // Выход просто отражает первый вход (если есть)
            this.nextValue = this.inputs.length > 0 ? this.inputs[0].value : false;
        }
    }

    class Wire {
        constructor(from, to) {
            this.from = from;
            this.to = to;
        }
    }

    class Circuit {
        constructor() {
            this.elements = [];
            this.wires = new Map(); // Используем Set вместо массива
            this.tick = 0;
        }

        addElement(el) {
            this.elements.push(el);
            return el;
        }

        addWire(from, to) {
            // Проверяем, нет ли уже такого провода
            const wireKey = `${from.id}-${to.id}`;
            const reverseWireKey = `${to.id}-${from.id}`;


            if (this.wires.has(wireKey) || this.wires.has(reverseWireKey))
                return false;


            this.wires.set(wireKey, new Wire(from, to));
            to.addInput(from);
            return true;
        }

        removeWire(from, to) {
            const wireKey = `${from.id}-${to.id}`;

            if (this.wires.has(wireKey)) {
                this.wires.delete(wireKey);
                to.removeInput(from);
                return true;
            }

            return false;
        }

        // Удалить все провода, связанные с элементом
        removeWiresForElement(element) {
            const wiresToRemove = [];

            // Сначала находим все провода для удаления
            const elID = element.id;
            let wire, key;
            for (const el of this.elements) {
                if ((wire = this.wires.get(key = `${elID}-${el.id}`)) !== undefined)
                    wiresToRemove.push([wire, key]);
            }

            for (const el of element.inputs) {
                wiresToRemove.push([this.wires.get(key = `${el.id}-${elID}`), key]);
            }

            // Затем удаляем их
            for (const wire of wiresToRemove) {
                wire[0].to.removeInput(wire[0].from);
                this.wires.delete(wire[1]);
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
                if (el instanceof InputElement) {
                    el.setValue(false);
                } else {
                    el.value = false;
                    el.nextValue = false;
                }
            }
            this.tick = 0;
        }
    }

    // Экспортируем классы для main.js
    window.LogicGates = {
        LogicGate, TFlop, Timer, Button, Switch, OutputElement, Circuit
    };
})();