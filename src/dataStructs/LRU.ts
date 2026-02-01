export class LRU<K> {
    private accessOrder = new Set<K>();

    constructor() {
    }

    // Отметить использование
    access(key: K): void {
        if (this.accessOrder.has(key)) {
            // Удаляем и добавляем в конец
            this.accessOrder.delete(key);
        }
        this.accessOrder.add(key);
    }

    // Удалить ключ
    delete(key: K): boolean {
        return this.accessOrder.delete(key);
    }

    // Проверить наличие
    has(key: K): boolean {
        return this.accessOrder.has(key);
    }

    // Получить самый старый ключ
    getOldest(): K | undefined {
        return this.accessOrder.values().next().value;
    }

    *values(): IterableIterator<K> {
        for (const val of this.accessOrder) {
            yield val;
        }
    }

    // Получить все ключи от новых к старым
    getKeysNewestFirst(): K[] {
        return Array.from(this.accessOrder).reverse();
    }

    // Получить все ключи от старых к новым
    getKeysOldestFirst(): K[] {
        return Array.from(this.accessOrder);
    }

    // Очистить
    clear(): void {
        this.accessOrder.clear();
    }
}