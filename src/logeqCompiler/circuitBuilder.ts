// circuitBuilder.ts - Обработчик N-арных операторов
import {
    Program, FunctionDecl, StatementList,
    AssignStmt, CallAssignStmt, ExprStmt, ReturnStmt,
    Identifier, Literal, UnaryOp, NaryOp, CallExpr, GroupExpr, BinaryOp,
    Expr,
    Stmt,
    type Position
} from './ast';

export type Element = {
    id: string;
    type: string;
    inputs: string[];
    layer: number;
};

export type CircuitLayers = Element[][];

class OperatorInfo {
    static readonly GATE_TYPES = {
        '&': 'AND',
        '&!': 'NAND',
        '|': 'OR',
        '|!': 'NOR',
        '^': 'XOR',
        '^!': 'XNOR',
        '!': 'NOT'
    } as const;

    static readonly ASSOCIATIVE_GATES = new Set(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR']);

    static getGateType(op: string): string {
        return this.GATE_TYPES[op as keyof typeof this.GATE_TYPES] || op;
    }

    static isAssociative(gateType: string): boolean {
        return this.ASSOCIATIVE_GATES.has(gateType);
    }
}

export class CircuitBuilder {
    private elements: Element[] = [];
    private variableMap: Map<string, string> = new Map();
    private idCounters: Record<string, number> = {
        AND: 0, OR: 0, XOR: 0,
        NAND: 0, NOR: 0, XNOR: 0,
        NOT: 0, OUTPUT: 0, BUFFER: 0
    };
    private lastLayer: number = 1;
    private functionDefs: Map<string, FunctionDecl> = new Map();
    private groupStack: number[] = []; // Для отслеживания вложенности групп
    private contextPrefix: string = "";
    constructor() {
        this.reset();
    }

    private reset(): void {
        this.elements = [];
        this.variableMap.clear();
        this.idCounters = {
            AND: 0, OR: 0, XOR: 0,
            NAND: 0, NOR: 0, XNOR: 0,
            NOT: 0, OUTPUT: 0, BUFFER: 0
        };
        this.lastLayer = 1;
        this.functionDefs.clear();
        this.groupStack = [];
    }

    buildFromAST(program: Program, flatten = true): CircuitLayers {
        this.reset();

        // Собираем определения функций
        for (const decl of program.declarations) {
            if (decl instanceof FunctionDecl) {
                this.functionDefs.set(decl.name, decl);
            }
        }

        // Обрабатываем все декларации
        for (const decl of program.declarations) {
            if (decl instanceof FunctionDecl) {
                continue;
            } else if (decl instanceof StatementList) {
                this.processStatementList(decl);
            }
        }

        if (flatten) {
            this.flattenAssociativeGates();
        }

        this.recalculateLayers();
        return this.getLayers();
    }

    private processStatementList(stmtList: StatementList): void {
        for (const stmt of stmtList.statements) {
            this.processStatement(stmt);
        }
    }

    private processStatement(stmt: Stmt): void {
        if (stmt instanceof AssignStmt) {
            this.processAssignStmt(stmt);
        } else if (stmt instanceof CallAssignStmt) {
            this.processCallAssignStmt(stmt);
        } else if (stmt instanceof ExprStmt) {
            this.processExprStmt(stmt);
        }
    }

    private processAssignStmt(stmt: AssignStmt): void {
        for (let i = 0; i < stmt.targets.length; i++) {
            const target = stmt.targets[i]!;
            const value = stmt.values[i]!;
            const resultId = this.evaluateExpression(value);

            if (this.isOutputTarget(target)) {
                this.addElement({
                    id: target,
                    type: 'OUTPUT',
                    inputs: [resultId],
                    layer: 1
                });
            } else {
                this.variableMap.set(target, resultId);
            }
        }
    }

    private processCallAssignStmt(stmt: CallAssignStmt): void {
        const resultIds = this.callFunction(stmt.callee, stmt.args, stmt.position);

        if (resultIds.length !== stmt.targets.length) {
            throw new BuildError('function-return-n-but-assign-to-m', stmt.position,
                [stmt.callee, resultIds.length, stmt.targets.length]);
        }

        for (let i = 0; i < stmt.targets.length; i++) {
            const target = stmt.targets[i]!;
            const resultId = resultIds[i]!;

            if (this.isOutputTarget(target)) {
                this.addElement({
                    id: target,
                    type: 'OUTPUT',
                    inputs: [resultId],
                    layer: 1
                });
            } else {
                this.variableMap.set(target, resultId);
            }
        }
    }

    private processExprStmt(stmt: ExprStmt): void {
        this.evaluateExpression(stmt.expr);
    }

    private callFunction(callee: string, args: Expr[], position: Position): string[] {
        const func = this.functionDefs.get(callee);
        if (!func) {
            throw new BuildError("function-undefined", position, [callee]);
        }

        if (args.length !== func.params.length) {
            throw new BuildError("function-expected-n-but-got-m", position,
                [callee, func.params.length, args.length]);
        }
        if (this.idCounters[callee] === undefined)
            this.idCounters[callee] = 0;
        else
            this.idCounters[callee]++;
        const callIndex = this.idCounters[callee];
        const oldContextPrefix = this.contextPrefix;
        this.contextPrefix = `${callee}_${callIndex}_`;

        try {

            for (let i = 0; i < func.params.length; i++) {
                const paramName = func.params[i]!;
                const argValue = this.evaluateExpression(args[i]!);
                this.variableMap.set(paramName, argValue);
            }

            const returnValues: string[] = [];

            for (const stmt of func.body) {
                if (stmt instanceof ReturnStmt) {
                    for (const expr of stmt.values) {
                        returnValues.push(this.evaluateExpression(expr));
                    }
                    break;
                } else {
                    this.processStatement(stmt);
                }
            }

            return returnValues;

        } finally {
            this.contextPrefix = oldContextPrefix;
        }
    }

    private evaluateExpression(expr: Expr): string {
        if (expr instanceof Identifier) {
            return this.resolveIdentifier(expr);
        } else if (expr instanceof Literal) {
            return this.createConstant(expr.value);
        } else if (expr instanceof UnaryOp) {
            return this.evaluateUnaryOp(expr);
        } else if (expr instanceof BinaryOp) {
            return this.evaluateBinaryOp(expr);
        } else if (expr instanceof NaryOp) {
            return this.evaluateNaryOp(expr);
        } else if (expr instanceof GroupExpr) {
            return this.evaluateGroupExpr(expr);
        } else if (expr instanceof CallExpr) {
            return this.evaluateCallExpr(expr);
        }

        throw new BuildError("unknown-expression-type", expr.position, [expr.constructor.name]);
    }

    private evaluateUnaryOp(unary: UnaryOp): string {
        const operandId = this.evaluateExpression(unary.expr);
        if (this.idCounters.NOT !== undefined) {
            const notId = `${this.contextPrefix}NOT_${this.idCounters.NOT++}`;
            this.addElement({
                id: notId,
                type: 'NOT',
                inputs: [operandId],
                layer: 1
            });

            return notId;
        }
        return "";

    }

    private evaluateBinaryOp(binary: BinaryOp): string {
        const leftId = this.evaluateExpression(binary.left);
        const rightId = this.evaluateExpression(binary.right);
        const gateType = OperatorInfo.getGateType(binary.op);
        if (this.idCounters[gateType] !== undefined) {            
            const gateId = `${this.contextPrefix}${gateType}_${this.idCounters[gateType]++}`;
    
            this.addElement({
                id: gateId,
                type: gateType,
                inputs: [leftId, rightId],
                layer: 1
            });
    
            return gateId;
        }
        return "";
    }

    private evaluateNaryOp(nary: NaryOp): string {
        const gateType = OperatorInfo.getGateType(nary.op);
        const operandIds: string[] = [];

        // Вычисляем все операнды
        for (const operand of nary.operands) {
            operandIds.push(this.evaluateExpression(operand));
        }
        if (this.idCounters[gateType] !== undefined) {
            const gateId = `${this.contextPrefix}${gateType}_${this.idCounters[gateType]++}`;
            this.addElement({
                id: gateId,
                type: gateType,
                inputs: operandIds,
                layer: 1
            });
            return gateId;
        }
        return "";
    }

    private evaluateGroupExpr(group: GroupExpr): string {
        // Начинаем новую группу
        this.groupStack.push(this.elements.length);

        try {
            // Вычисляем выражение внутри скобок
            return this.evaluateExpression(group.expr);
        } finally {
            // Завершаем группу
            this.groupStack.pop();
        }
    }

    private evaluateCallExpr(call: CallExpr): string {
        const resultIds = this.callFunction(call.callee, call.args, call.position);

        if (resultIds.length !== 1) {
            throw new BuildError("function-return-n-but-need-one", call.position,
                [call.callee, resultIds.length]);
        }

        return resultIds[0]!;
    }

    private createConstant(value: 0 | 1): string {
        const constId = `CONST_${value}`;

        if (this.variableMap.has(constId)) {
            return this.variableMap.get(constId)!;
        }

        if (value === 1 && !this.variableMap.has('CONST_0')) {
            this.addElement({
                id: 'CONST_0',
                type: 'AND',
                inputs: [],
                layer: 1
            });
            this.variableMap.set('CONST_0', 'CONST_0');
        }
        const type = value === 0 ? 'AND' : 'NAND';
        this.addElement({
            id: constId,
            type: type,
            inputs: (value === 0 ? [] : ['CONST_0']),
            layer: 1
        });

        this.variableMap.set(constId, constId);
        return constId;
    }

    private resolveIdentifier(expr: Identifier): string {
        const name = expr.name;
        if (this.variableMap.has(name)) {
            return this.variableMap.get(name)!;
        }

        if (this.isInputIdentifier(name)) {
            if (!this.elements.some(el => el.id === name)) {
                const type = this.getInputType(name);
                this.addElement({
                    id: name,
                    type: type,
                    inputs: [],
                    layer: 1
                });
            }
            this.variableMap.set(name, name);
            return name;
        }

        throw new BuildError("unknown-identifier", expr.position, [name]);
    }

    private isInputIdentifier(name: string): boolean {
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
            !/^L[0-9]+$/.test(name);
    }

    private getInputType(name: string): string {
        if (/^S[0-9]+/.test(name)) {
            return 'SWITCH';
        } else if (/^B[0-9]+/.test(name)) {
            return 'BUTTON';
        }
        return 'INPUT';
    }

    private isOutputTarget(name: string): boolean {
        return /^L[0-9]+$/.test(name);
    }

    private addElement(element: Element): void {
        this.elements.push(element);
    }

    private flattenAssociativeGates(): void {
        const elementsToRemove = new Set<string>();
        const elementsToSave = new Set<string>();
        const outputCount = new Map<string, number>();

        // Считаем использование каждого элемента
        for (const element of this.elements) {
            for (const inputId of element.inputs) {
                outputCount.set(inputId, (outputCount.get(inputId) || 0) + 1);
            }
        }

        // Flatten ассоциативных вентилей
        for (const element of this.elements) {
            const opType = element.type;

            if (OperatorInfo.isAssociative(opType)) {
                const newInputs: string[] = [];

                for (const inputId of element.inputs) {
                    const inputElement = this.elements.find(el => el.id === inputId);

                    if (inputElement &&
                        !elementsToSave.has(inputId) &&
                        inputElement.type === opType &&
                        (outputCount.get(inputId) || 0) === 1) {
                        newInputs.push(...inputElement.inputs);
                        elementsToRemove.add(inputId);
                    } else {
                        newInputs.push(inputId);
                        elementsToSave.add(inputId);
                    }
                }

                element.inputs = [...new Set(newInputs)];
                elementsToSave.add(element.id);

            } else if (opType === 'NOT' && element.inputs.length === 2 &&
                element.inputs[0] === element.inputs[1]) {
                // Оптимизация NOT
                this.optimizeNotGate(element, outputCount, elementsToRemove, elementsToSave);
            }
        }

        this.elements = this.elements.filter(el =>
            !elementsToRemove.has(el.id) || elementsToSave.has(el.id)
        );
    }

    private optimizeNotGate(
        element: Element,
        outputCount: Map<string, number>,
        elementsToRemove: Set<string>,
        elementsToSave: Set<string>
    ): void {
        const inputId = element.inputs[0]!;
        const inputElement = this.elements.find(el => el.id === inputId);

        if (!inputElement || elementsToSave.has(inputId) ||
            (outputCount.get(inputId) || 0) !== 1) {
            return;
        }

        let newType: string;

        switch (inputElement.type) {
            case 'NAND':
                if (inputElement.inputs.length === 2 &&
                    inputElement.inputs[0] === inputElement.inputs[1]) {
                    newType = 'AND';
                    element.inputs = inputElement.inputs;
                    elementsToRemove.add(inputId);
                } else {
                    return;
                }
                break;
            case 'AND': newType = 'NAND'; break;
            case 'OR': newType = 'NOR'; break;
            case 'XOR': newType = 'XNOR'; break;
            case 'NOR': newType = 'OR'; break;
            case 'XNOR': newType = 'XOR'; break;
            default: return;
        }

        element.type = newType;
        if (newType === 'AND') {
            element.inputs = inputElement.inputs;
        }
        elementsToRemove.add(inputId);
    }

    private recalculateLayers(): void {
        let changed = true;

        while (changed) {
            changed = false;

            for (const element of this.elements) {
                if (element.type === 'INPUT' || element.type === 'SWITCH' ||
                    element.type === 'BUTTON' || element.id.startsWith('CONST_')) {
                    continue;
                }

                let maxInputLayer = 0;

                for (const inputId of element.inputs) {
                    const inputElement = this.elements.find(el => el.id === inputId);

                    if (inputElement) {
                        maxInputLayer = Math.max(maxInputLayer, inputElement.layer || 0);
                    } else {
                        maxInputLayer = Math.max(maxInputLayer, 1);
                    }
                }

                const newLayer = maxInputLayer + 1;
                this.lastLayer = Math.max(this.lastLayer, newLayer);

                if (element.layer !== newLayer) {
                    element.layer = newLayer;
                    changed = true;
                }
            }
        }

        for (const element of this.elements) {
            if (element.type === 'OUTPUT') {
                element.layer = this.lastLayer;
            }
        }
    }

    private getLayers(): CircuitLayers {
        const layers: Element[][] = Array.from({ length: this.lastLayer }, () => []);

        for (const element of this.elements) {
            if (element.type === 'NOT') {
                element.type = 'NAND';
            }

            const layerIndex = element.layer - 1;
            if (layerIndex >= 0 && layerIndex < layers.length) {
                if (element.id.startsWith('CONST_'))
                    layers[layerIndex]!.unshift(element);
                else
                    layers[layerIndex]!.push(element);
            }
        }

        return layers;
    }

    
}
export class BuildError extends Error {
    constructor(
        message: string,
        public pos: Position,
        public args: any[]
    ) {
        super(message);
        this.name = 'BuildError';
    }
}