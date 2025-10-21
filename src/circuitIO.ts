import { typeToshapeId, shapeIdToType, gateTypeToMode, type Camera, CopyWiresMode } from "./consts";
import * as LogicGates from "./logic";
import { screenToWorld } from "./utils";

// Сериализация схемы в JSON
export class CircuitIO {
    circuit: LogicGates.Circuit;
    canvas: HTMLCanvasElement;
    camera: Camera;
    constructor(circuit: LogicGates.Circuit, camera: Camera, canvas: HTMLCanvasElement) {
        this.circuit = circuit;
        this.canvas = canvas;
        this.camera = camera;
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
    unuseBlueprintObjects: Array<Object> = [];
    deserializeCircuit(json: string) {
        const data = JSON.parse(json);
        this.circuit.clear();
        const idMap = new Map<number, LogicGates.LogicElement>();
        const version = data.version;

        const center = screenToWorld(this.camera, this.canvas.width / 2, this.canvas.height / 2);
        const blueprintRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

        if (version === 3 || version === 4) {
            let type: string | undefined;
            for (const body of data.bodies) {
                for (const child of body.childs) {
                    if ((type = shapeIdToType.get(child.shapeId))) {
                        const obj = this.addElement(type, child);
                        if (obj) {
                            idMap.set(child.id, obj);
                            blueprintRect.x0 = Math.min(obj.x, blueprintRect.x0);
                            blueprintRect.y0 = Math.min(obj.y, blueprintRect.y0);
                            blueprintRect.x1 = Math.max(obj.x, blueprintRect.x1);
                            blueprintRect.y1 = Math.max(obj.y, blueprintRect.y1);
                        }
                    } else {
                        this.unuseBlueprintObjects.push(child);
                    }
                }
            }
            const blueprintCenter = {
                x: (blueprintRect.x1 + blueprintRect.x0) / 2,
                y: (blueprintRect.y1 + blueprintRect.y0) / 2
            }
            const blueprintDelta = {
                x: Math.round(center.x - blueprintCenter.x),
                y: Math.round(center.y - blueprintCenter.y),
            }

            for (const body of data.bodies) {
                for (const child of body.childs) {
                    if ((type = shapeIdToType.get(child.shapeId))) {
                        const src = idMap.get(child.id)!;
                        src.x += blueprintDelta.x;
                        src.y += blueprintDelta.y;
                        if (child.controller.controllers) {
                            for (const controlled of child.controller.controllers) {
                                const dst = idMap.get(controlled.id);
                                if (src && dst) {
                                    this.circuit.addWire(src, dst);
                                    if (src instanceof LogicGates.LogicGate && src.gateType == 2 && src == dst) {
                                        src.gateType = 6;
                                    }
                                }
                            }
                        }
                    }
                }
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
    addElement(type: string, params: Record<string, any>) {
        const center = screenToWorld(this.camera, this.canvas.width / 2, this.canvas.height / 2);
        params.pos = params.pos || {};
        params.controller = params.controller || {};
        params.pos.x = params.pos.x || Math.round(center.x + Math.random() * 10 - 5);
        params.pos.y = params.pos.y || Math.round(center.y + Math.random() * 10 - 5);
        params.pos.z = params.pos.z || 0;
        params.xaxis = params.xaxis || -2;
        params.zaxis = params.zaxis || -1;
        params.color = params.color || (document.documentElement.getAttribute('data-theme') === 'dark' ? "222222" : "eeeeee");
        params.controller.luminance = params.controller.luminance || 50;

        let mode;
        if ((mode = gateTypeToMode.get(type)) !== undefined) {
            params.controller.mode = mode;
            type = 'GATE';
        }

        return this.circuit.addElement(type, params);
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

            const newEl = this.addElement(el.type, { pos: { x: baseWorldX + offsetX, y: baseWorldY + offsetY }, color: el.color, controller: el.getController() });
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

}
