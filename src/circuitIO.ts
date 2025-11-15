import { typeToshapeId, shapeIdToType, gateTypeToMode, type Camera, CopyWiresMode, type Point } from "./consts";
import * as LogicGates from "./logic";
import { screenToWorld } from "./utils";
export type Element = { id: string, type: string, inputs: string[], layer: number };
type Rect = { x0: number, y0: number, x1: number, y1: number };
// Сериализация схемы в JSON
export class CircuitIO {

    circuit: LogicGates.Circuit;
    canvas: HTMLCanvasElement;
    camera: Camera;
    colorPicker: HTMLInputElement;
    constructor(
        circuit: LogicGates.Circuit,
        colorPicker: HTMLInputElement,
        camera: Camera,
        canvas: HTMLCanvasElement
    ) {
        this.circuit = circuit;
        this.canvas = canvas;
        this.camera = camera;
        this.colorPicker = colorPicker;
    }
    clearCircuit() {
        this.circuit.clear();
    }

    fromLayers(layers: Element[][], inputElementType: string) {
        let maxHeight = 0;
        for (const layer of layers) maxHeight = Math.max(layer.length, maxHeight);

        const center = screenToWorld(this.camera, this.canvas.width / 2, this.canvas.height / 2);
        const topLeft = { x: Math.round(center.x) - layers.length, y: Math.round(center.y) - maxHeight };
        if (!typeToshapeId.has(inputElementType) && !gateTypeToMode.has(inputElementType)
            || typeToshapeId.has(inputElementType) && inputElementType === 'GATE')
            inputElementType = 'AND';
        const idMap = new Map<string, LogicGates.LogicElement>();
        let i = 0, j = 0;
        for (const layer of layers) {
            j = 0;
            const padding = maxHeight - layer.length;
            for (const el of layer) {
                const type = el.type === 'INPUT' ? inputElementType : el.type;
                const obj = this.addElement(type,
                    {
                        pos: { x: topLeft.x + 2 * i, y: topLeft.y + 2 * j + padding }
                    }
                );
                if (obj) {
                    idMap.set(el.id, obj);
                    for (const input of el.inputs) {
                        const from = idMap.get(input);
                        if (from)
                            this.circuit.addWire(from, obj);
                    }
                }
                ++j;
            }
            ++i;
        }
        return idMap.values();
    }
    serializeCircuit(): string {
        const data = {
            bodies: [
                {
                    childs: [...this.unuseBlueprintObjects, ...Array.from(this.circuit.elements).map(el => ({
                        color: el.color,
                        id: el.id,
                        controller: el.getController(),
                        pos: {
                            x: el.x,
                            y: el.y,
                            z: el.z
                        },
                        shapeId: typeToshapeId.get(el.type),
                        xaxis: el.xaxis,
                        zaxis: el.zaxis
                    }))],
                }
            ],
            version: 4
        };
        return JSON.stringify(data, null);
    }

    serializeSelectedElements(selectedElements: Set<LogicGates.LogicElement>) {
        const data = Array.from(selectedElements).map(el => {
            const controller = el.getController();
            return {
                color: el.color,
                id: el.id,
                controller: controller,
                pos: {
                    x: el.x,
                    y: el.y,
                    z: el.z
                },
                shapeId: typeToshapeId.get(el.type),
                xaxis: el.xaxis,
                zaxis: el.zaxis,
                inputs: Array.from(el.inputs).map(el => el.id)
            }
        });
        return JSON.stringify(data, null);
    }

    deserializeJSONAtPoint(copyWiresMode: number, json: string, point: Point) {
        const idMap = new Map<number, LogicGates.LogicElement>();
        const srcIdMap = new Map<number, LogicGates.LogicElement>();
        const dstIdMap = new Map<number, LogicGates.LogicElement>();
        const srcIds = new Map<number, number[]>();
        const dstIds = new Map<number, number[]>();
        const data = JSON.parse(json);
        const blueprintRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        this._fillIdMap(data, idMap, blueprintRect);
        let doWires = true;
        if (copyWiresMode === CopyWiresMode.None) {
            doWires = false;
        } else if (copyWiresMode === CopyWiresMode.All) {
            for (const el of data) {
                for (const input of el.inputs) {
                    if (!idMap.has(input)) {
                        if (!srcIds.has(input))
                            srcIds.set(input, []);
                        srcIds.get(input)?.push(el.id);
                    }
                }
                for (const output of el.controller.controllers) {
                    if (!idMap.has(output.id)) {
                        if (!dstIds.has(output.id))
                            dstIds.set(output.id, []);
                        dstIds.get(output.id)?.push(el.id);
                    }
                }
            }
            this.circuit.elements.forEach(el => {
                if (!idMap.has(el.id)) {
                    if (srcIds.has(el.id)) srcIdMap.set(el.id, el);
                    if (dstIds.has(el.id)) dstIdMap.set(el.id, el);
                }
            });
            console.log(idMap, srcIdMap, dstIdMap);
        }

        const blueprintDelta = this._getBlueprintDeltaToPoint(blueprintRect, point);
        this._wireUpFromIterable(data, idMap, blueprintDelta, doWires);

        if (copyWiresMode === CopyWiresMode.All) {
            for (const [srcId, outputs] of srcIds) {
                const src = srcIdMap.get(srcId);
                if (src) {
                    for (const dstId of outputs) {
                        const dst = idMap.get(dstId);
                        if (dst) {
                            this._makeWire(src, dst);
                        }
                    }
                }
            }
            for (const [dstId, inputs] of dstIds) {
                const dst = dstIdMap.get(dstId);
                if (dst) {
                    for (const srcId of inputs) {
                        const src = idMap.get(srcId);
                        if (src) {
                            this._makeWire(src, dst);
                        }
                    }
                }
            }
        }

        return idMap.values();
    }

    unuseBlueprintObjects: Array<Object> = [];
    private _makeWire(src: LogicGates.LogicElement | LogicGates.LogicGate, dst: LogicGates.LogicElement) {
        this.circuit.addWire(src, dst);
        if (src instanceof LogicGates.LogicGate && src.gateType == 2 && src == dst) {
            src.gateType = 6;
        }
    }

    deserializeCircuit(json: string) {
        const data = JSON.parse(json);
        this.circuit.clear();
        const idMap = new Map<number, LogicGates.LogicElement>();
        const version = data.version;

        const center = screenToWorld(this.camera, this.canvas.width / 2, this.canvas.height / 2);
        const blueprintRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

        if (version === 3 || version === 4) {
            for (const body of data.bodies) {
                this._fillIdMap(body.childs, idMap, blueprintRect);
            }
            const blueprintDelta = this._getBlueprintDeltaToPoint(blueprintRect, center);

            for (const body of data.bodies) {
                this._wireUpFromIterable(body.childs, idMap, blueprintDelta, true);
            }


        } else {
            for (const el of data.elements) {
                let type = gateTypeToMode.has(el.type) ? 'GATE' : el.type;
                const obj = this.addElement(type, type === 'GATE' ? { pos: { x: el.x, y: el.y }, controller: { mode: gateTypeToMode.get(el.type) } } : { pos: { x: el.x, y: el.y } });
                if (obj) {
                    idMap.set(el.id, obj);
                }
            }

            if (!version) {
                for (const w of data.wires) {
                    const src = idMap.get(w.from);
                    const dst = idMap.get(w.to);
                    if (src && dst) {
                        this.circuit.addWire(src, dst);
                    }
                }
            } else if (version === 1) {
                for (const w of data.wires) {
                    const src = idMap.get(w.src);
                    const dst = idMap.get(w.dst);
                    if (src && dst) {
                        this.circuit.addWire(src, dst);
                    }
                }
            }
        }

    }

    rotateSelected(selectedElements: Set<LogicGates.LogicElement>, clockwise: boolean) {
        const sinF = clockwise ? -1 : 1;
        const blueprintRect = this._getBlueprintRect(selectedElements);
        const cX = Math.round((blueprintRect.x1 + blueprintRect.x0) / 2);
        const cY = Math.round((blueprintRect.y1 + blueprintRect.y0) / 2);
        console.log(cX, cY)
        selectedElements.forEach(el => {
            const elX = el.x;
            const elY = el.y;
            el.x = cX - (elY - cY) * sinF;
            el.y = cY + (elX - cX) * sinF;
        });
        
    }

    flipSelected(selectedElements: Set<LogicGates.LogicElement>, vertical: boolean) {
        const blueprintRect = this._getBlueprintRect(selectedElements);
        const cX = Math.round((blueprintRect.x1 + blueprintRect.x0) / 2);
        const cY = Math.round((blueprintRect.y1 + blueprintRect.y0) / 2);
        if (vertical)
            selectedElements.forEach(el => el.y += (cY - el.y) * 2);
        else
            selectedElements.forEach(el => el.x += (cX - el.x) * 2);
    }

    private _getBlueprintRect(iterable: any): Rect {
        const blueprintRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (const el of iterable) {
            this._updateBlueprintRect(el, blueprintRect);
        }
        return blueprintRect;
    }

    private _updateBlueprintRect(obj: Point, blueprintRect: Rect) {
        blueprintRect.x0 = Math.min(obj.x, blueprintRect.x0);
        blueprintRect.y0 = Math.min(obj.y, blueprintRect.y0);
        blueprintRect.x1 = Math.max(obj.x, blueprintRect.x1);
        blueprintRect.y1 = Math.max(obj.y, blueprintRect.y1);
    }

    private _getBlueprintDeltaToPoint(blueprintRect: Rect, point: Point) {
        const blueprintCenter = {
            x: (blueprintRect.x1 + blueprintRect.x0) / 2,
            y: (blueprintRect.y1 + blueprintRect.y0) / 2
        };
        const blueprintDelta = {
            x: Math.round(point.x - blueprintCenter.x),
            y: Math.round(point.y - blueprintCenter.y),
        };
        return blueprintDelta;
    }

    private _fillIdMap(iterable: any, idMap: Map<number, LogicGates.LogicElement>, blueprintRect: Rect | null) {
        let type: string | undefined;
        for (const child of iterable) {
            if ((type = shapeIdToType.get(child.shapeId))) {
                const obj = this.addElement(type, child);
                if (obj) {
                    idMap.set(child.id, obj);
                    if (blueprintRect) {
                        this._updateBlueprintRect(obj, blueprintRect);
                    }
                }
            } else {
                this.unuseBlueprintObjects.push(child);
            }
        }
    }

    private _wireUpFromIterable(iterable: any, idMap: Map<number, LogicGates.LogicElement>, blueprintDelta: Point, doWires: boolean) {
        let type: string | undefined;
        for (const child of iterable) {
            if ((type = shapeIdToType.get(child.shapeId))) {
                const src = idMap.get(child.id)!;
                src.x += blueprintDelta.x;
                src.y += blueprintDelta.y;
                if (child.controller.controllers) {
                    for (const controlled of child.controller.controllers) {
                        const dst = idMap.get(controlled.id);
                        if (doWires && src && dst) {
                            this._makeWire(src, dst);
                        }
                    }
                }
            }
        }
    }

    addElement(type: string, params: Record<string, any>) {
        const center = screenToWorld(this.camera, this.canvas.width / 2, this.canvas.height / 2);
        params.pos = params.pos || {};
        params.controller = params.controller || {};
        params.pos.x = params.pos.x || Math.round(center.x + Math.random() * 10 - 5);
        params.pos.y = params.pos.y || Math.round(center.y + Math.random() * 10 - 5);
        params.pos.z = params.pos.z || 0;
        params.xaxis = params.xaxis || -2;
        params.zaxis = params.zaxis || -1;
        params.color = params.color || this._getColor();
        params.controller.luminance = params.controller.luminance || 50;

        let mode;
        if ((mode = gateTypeToMode.get(type)) !== undefined) {
            params.controller.mode = mode;
            type = 'GATE';
        }

        return this.circuit.addElement(type, params);
    }

    paintSelected(selectedElements: Iterable<LogicGates.LogicElement>, color: string | null) {
        if (color === null)
            color = this._getColor();
        for (const el of selectedElements) {
            el.color = color;
        }
    }

    pasteSelectedElementsAtCursor(
        copyWiresMode: CopyWiresMode,
        selectedElements: Set<LogicGates.LogicElement>,
        cursorScreenX: number,
        cursorScreenY: number
    ) {
        if (selectedElements.size === 0) return;

        // 1. Находим минимальные X и Y среди выбранных
        let minX = Infinity;
        let minY = Infinity;
        for (const el of selectedElements) {
            if (el.x < minX) minX = el.x;
            if (el.y < minY) minY = el.y;
        }

        // 2. Получаем мировые координаты курсора и округляем вниз
        let { x: baseWorldX, y: baseWorldY } = screenToWorld(this.camera, cursorScreenX, cursorScreenY);
        baseWorldX = Math.floor(baseWorldX);
        baseWorldY = Math.floor(baseWorldY);

        // 3. Копируем элементы с сохранением смещений
        const oldToNewMap = new Map<number, LogicGates.LogicElement>();

        for (const el of selectedElements) {
            const offsetX = el.x - minX;
            const offsetY = el.y - minY;
            const controller = el.getController();
            if (controller && el instanceof LogicGates.LogicGate && el.gateType === 6)
                controller.mode = 6;
            const newEl = this.addElement(el.type, { pos: { x: baseWorldX + offsetX, y: baseWorldY + offsetY }, color: el.color, controller: controller });
            if (newEl)
                oldToNewMap.set(el.id, newEl);
        }

        // 4. Восстанавливаем соединения в зависимости от режима
        if (copyWiresMode !== CopyWiresMode.None) {
            for (const oldEl of selectedElements) {
                const newEl = oldToNewMap.get(oldEl.id)!;

                for (const inputEl of oldEl.inputs) {
                    if (copyWiresMode === CopyWiresMode.Inner) {
                        // Только внутренние связи
                        if (selectedElements.has(inputEl)) {
                            const newInputEl = oldToNewMap.get(inputEl.id)!;
                            this.circuit.addWire(newInputEl, newEl);
                        }
                    } else if (copyWiresMode === CopyWiresMode.All) {
                        // Внутренние + внешние
                        if (selectedElements.has(inputEl)) {
                            const newInputEl = oldToNewMap.get(inputEl.id)!;
                            this.circuit.addWire(newInputEl, newEl);
                        } else {
                            this.circuit.addWire(inputEl, newEl);
                        }
                    }
                }
            }
        }
    }
    _getColor() {
        return this.colorPicker.value.replace("#", "");
    }
}
