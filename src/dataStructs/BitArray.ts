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