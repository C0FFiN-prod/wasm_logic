// Вектор фиксированной длины с проверкой
type Value<T> = T | VectorDimN<T>;
type Data<T> = Value<T>[];
export class VectorDimN<T> {
    private data: Data<T>;
    readonly dimensions: number[];

    constructor(defaults: T, ...dimensions: number[]) {
        if (dimensions.length === 1) {
            this.data = new Array(dimensions[0]);
            this.data.fill(defaults);
        } else {
            const dim = dimensions.shift()!; 
            this.data = new Array(dim);
            for (let i = 0; i < dim; ++i){
                this.data[i] = new VectorDimN<T>(defaults, ...dimensions);
            }
        }
        this.dimensions = dimensions;
    }

    get(...index: number[]): Value<T> {
        let current: Data<T> = this.data;
        for (let i = 0; i < index.length - 1; ++i) {
            const j = index[i];
            current = (current instanceof VectorDimN) ? current.data[j] : current[j];
        }
        return current[index[index.length - 1]];
    }
    
    set(value: T, ...index: number[]): void {
        let current: Data<T> = this.data;
        for (let i = 0; i < index.length - 1; ++i) {
            const j = index[i];
            current = (current instanceof VectorDimN) ? current.data[j] : current[j];
        }
        current[index[index.length - 1]] = value;
    }

    fill(value: T) {
        for (const el of this.data) {
            if (el instanceof VectorDimN || el instanceof Array)
                el.fill(value);
        }
    }
}