export class Queue<T> {
    private buffer: (T | undefined)[];
    private head: number = 0;
    private tail: number = 0;
    private count: number = 0;

    constructor(capacity: number = 16) {
        this.buffer = new Array(capacity);
    }

    // Добавить элемент
    push(item: T): void {
        if (this.isFull()) {
            this.resize(this.buffer.length * 2);
        }

        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.buffer.length;
        this.count++;
    }

    // Удалить элемент
    pop(): T | undefined {
        if (this.isEmpty()) {
            return undefined;
        }

        const item = this.buffer[this.head];
        this.buffer[this.head] = undefined;
        this.head = (this.head + 1) % this.buffer.length;
        this.count--;

        // // Уменьшаем размер если слишком пусто
        // if (this.count > 0 && this.count === Math.floor(this.buffer.length / 4)) {
        //     this.resize(Math.floor(this.buffer.length / 2));
        // }

        return item;
    }

    // Посмотреть первый элемент
    peek(): T | undefined {
        if (this.isEmpty()) {
            return undefined;
        }
        return this.buffer[this.head];
    }

    // Проверка на пустоту
    isEmpty(): boolean {
        return this.count === 0;
    }

    // Проверка на заполненность
    isFull(): boolean {
        return this.count === this.buffer.length;
    }

    // Размер очереди
    size(): number {
        return this.count;
    }

    // Емкость буфера
    capacity(): number {
        return this.buffer.length;
    }

    // Очистить очередь
    clear(): void {
        this.buffer = new Array(this.buffer.length);
        this.head = 0;
        this.tail = 0;
        this.count = 0;
    }

    // Изменить размер буфера
    resize(newCapacity: number): void {
        const newBuffer = new Array<T | undefined>(newCapacity);

        for (let i = 0; i < this.count; i++) {
            const index = (this.head + i) % this.buffer.length;
            newBuffer[i] = this.buffer[index];
        }

        this.buffer = newBuffer;
        this.head = 0;
        this.tail = this.count;
    }

    // Итератор
    *[Symbol.iterator](): Iterator<T> {
        for (let i = 0; i < this.count; i++) {
            const index = (this.head + i) % this.buffer.length;
            yield this.buffer[index]!;
        }
    }

    // Преобразовать в массив
    toArray(): T[] {
        const result: T[] = [];
        for (const item of this) {
            result.push(item);
        }
        return result;
    }
}