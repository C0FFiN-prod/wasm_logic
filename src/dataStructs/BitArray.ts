export class BitArray {
    private _length: number;
    private buffer: Uint32Array;
    constructor(capacity: number) {
        this._length = 0;
        this.buffer = new Uint32Array(Math.max(Math.ceil(capacity / 32) || 0, 4));
    }

    clear() {
        const n = Math.ceil(this._length / 32);
        for (let i = 0; i < n; ++i) {
            this.buffer[i] = 0;
        }
        this._length = 0;
    }

    [Symbol.iterator](): Iterator<number, number | undefined, number | undefined> {
        let i = 0;
        let bucket;
        let value;
        return {
            next: () => {
                bucket = this.buffer[Math.trunc(i / 32)];
                value = (bucket >>> (i % 32)) & 1;
                return i++ < this._length
                    ? { value, done: false }
                    : { value: undefined, done: true };
            }
        };
    }
    values = this[Symbol.iterator];

    push(value: boolean) {
        const row = Math.ceil((this._length + 1) / 32) - 1;
        if (this.buffer.length < row) {
            this.resize(row * 32 + 2);
        }
        this.buffer[row] |= Number(value) << (this._length % 32);
        ++this._length;
    }

    at(index: number) {
        const row = Math.trunc(index / 32);
        const col = index % 32;
        if (row > this.buffer.length)
            throw RangeError(`Buffer length is ${this.buffer.length}, but row is ${row}`);
        return Boolean((this.buffer[row] >>> col) & 1);
    }

    setAt(index: number, value: boolean) {
        const row = Math.trunc(index / 32);
        const col = index % 32;
        if (row > this.buffer.length)
            throw RangeError(`Buffer length is ${this.buffer.length}, but row is ${row}`);
        if ((this.buffer[row] >>> col & 1) != (Number(value) & 1))
            this.buffer[row] ^= 1 << col;
    }

    get length() { return this._length; }
    set length(size: number) {
        this.resize(size);
        this._length = size;
    }

    resize(size: number) {
        this._length = Math.min(this._length, size);
        const newCapacity = Math.trunc(size / 32) + 1;
        if (this.buffer.length === newCapacity) return newCapacity;
        const newBuffer = new Uint32Array(newCapacity);
        newBuffer.set(this.buffer.subarray(0, newCapacity), 0);
        this.buffer = newBuffer;
        return newCapacity;
    }

    shift(value?: boolean) {
        let nextValue = value ? 1 : 0;
        const row = Math.ceil(this._length / 32);
        const col = (this._length - 1) % 32;
        let j = col;
        for (let i = row; i-- != 0;) {
            const lastBit = this.buffer[i] & 1;
            this.buffer[i] = (this.buffer[i] >>> 1) | nextValue << j;
            j = 31;
            nextValue = lastBit;
        }
        if (value === undefined) --this._length;
        return nextValue;
    }

    unshift(value: boolean, resize = false) {
        let nextValue = Number(value ?? 0);
        if (!resize)
            this._length = Math.max(this._length + 1, (this.buffer.length << 5) - 1);
        else
            ++this._length;
        if (resize && (this._length > this.buffer.length * 32))
            this.buffer = new Uint32Array(this.buffer.buffer, 0, this.buffer.length << 1);
        for (let i = 0; i < this.buffer.length; ++i) {
            let lastBit = (this.buffer[i] >>> 31) & 1;
            this.buffer[i] = (this.buffer[i] << 1) | nextValue;
            nextValue = lastBit;
        }

        return nextValue;
    }

}