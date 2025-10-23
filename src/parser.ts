type Operator = { precedence: number, type: string, arity: number, associative: boolean }
type Element = { id: string, type: string, inputs: string[], layer: number }
class LogicalExpressionParser {
    static OPERATORS:Record<string, Operator> = {
        // Precedence: lower number means higher precedence
        // All binary operators are left-associative
        // Added 'associative' property to help with N-ary grouping
        '!': { precedence: 4, type: 'NOT', arity: 1, associative: false },
        '&': { precedence: 3, type: 'AND', arity: 2, associative: true },
        '&!': { precedence: 3, type: 'NAND', arity: 2, associative: false },
        '^': { precedence: 2, type: 'XOR', arity: 2, associative: true },
        '^!': { precedence: 2, type: 'XNOR', arity: 2, associative: false },
        '|': { precedence: 1, type: 'OR', arity: 2, associative: true },
        '|!': { precedence: 1, type: 'NOR', arity: 2, associative: false }
    };
    elements: Element[];
    variableMap: Map<string, string>;
    idCounters: Record<string, number>;
    lastLayer: number;

    static isOperator(token: string) {
        return Object.prototype.hasOwnProperty.call(LogicalExpressionParser.OPERATORS, token);
    }

    static getPrecedence(operator: string) {
        return LogicalExpressionParser.OPERATORS[operator]?.precedence || 0;
    }

    static getAssociativity(operator: any) {
        // All our binary operators are left-associative for this problem context
        return 'left';
    }

    constructor() {
        this.elements = [];
        this.variableMap = new Map(); // Maps variable name to its corresponding gate ID
        this.idCounters = { AND: 0, OR: 0, XOR: 0, NAND: 0, NOR: 0, XNOR: 0, OUTPUT: 0 };
        this.lastLayer = 0;
    }

    parse(text: string) {
        this.elements = [];
        this.variableMap = new Map();
        this.idCounters = { AND: 0, OR: 0, XOR: 0, NAND: 0, NOR: 0, XNOR: 0, OUTPUT: 0 };
        this.lastLayer = 0;

        const expressions = text.split(/;\s*|:\s*|\n/).filter((line: string) => line.trim() !== "");

        for (const expr of expressions) {
            this.processExpression(expr.trim());
        }

        this.flattenAssociativeGates();
        this.recalculateLayers();

        return this.getLayers();
    }

    // Step 1: Process each expression to build a preliminary circuit
    processExpression(expr: string) {
        const cleanedExpr = expr.replace(/\s+/g, "");
        let assignmentTarget = null;
        let logicalPart = cleanedExpr;

        const assignmentMatch = cleanedExpr.match(/^([a-zA-Z][a-zA-Z0-9]*)=(.*)$/);
        if (assignmentMatch) {
            assignmentTarget = assignmentMatch[1];
            logicalPart = assignmentMatch[2];

            if (assignmentTarget.match(/^(S|B)\d+$/))
                throw new Error(`Switch or Button are not assignable: ${assignmentTarget}`);
        }

        // Evaluate the logical part and get the ID of the resulting element
        const resultElement = this.evaluateExpression(logicalPart);

        if (assignmentTarget) {
            if (assignmentTarget.match(/^L\d+$/)) {
                // This is an OUTPUT element
                // Its layer will be determined by recalculateLayers later
                this.elements.push({ id: assignmentTarget, type: "OUTPUT", inputs: [resultElement.id], layer: 1 });
            } else {
                // This is a variable assignment, map it to the result element
                this.variableMap.set(assignmentTarget, resultElement.id);
            }
        }
    }

    // Step 2: Shunting-yard to convert infix to RPN, then build circuit from RPN
    evaluateExpression(expression: string) {
        const tokens = this.tokenize(expression);
        const rpn = this.shuntingYard(tokens);
        return this.buildCircuitFromRPN(rpn);
    }

    tokenize(expression: string) {
        const tokens = [];
        // Regex to capture operators and parentheses, ensuring multi-character operators are matched first
        const operatorRegex = /(\&!|\|!|\^!|\&|\||\^|!|\(|\))/g;
        let lastIndex = 0;
        let match;

        while ((match = operatorRegex.exec(expression)) !== null) {
            if (match.index > lastIndex) {
                const operand = expression.substring(lastIndex, match.index).trim();
                if (operand) tokens.push(operand);
            }
            tokens.push(match[0]);
            lastIndex = operatorRegex.lastIndex;
        }
        if (lastIndex < expression.length) {
            const operand = expression.substring(lastIndex).trim();
            if (operand) tokens.push(operand);
        }
        return tokens.filter(t => t !== '');
    }

    shuntingYard(tokens: any[]) {
        const outputQueue = [];
        const operatorStack = [];

        for (const token of tokens) {
            if (token === '(') {
                operatorStack.push(token);
            } else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop());
                }
                if (operatorStack.length === 0) {
                    throw new Error('Mismatched parentheses');
                }
                operatorStack.pop(); // Pop the '('
            } else if (LogicalExpressionParser.isOperator(token)) {
                const op1 = token;
                while (
                    operatorStack.length > 0 &&
                    LogicalExpressionParser.isOperator(operatorStack[operatorStack.length - 1])
                ) {
                    const op2 = operatorStack[operatorStack.length - 1];
                    // Handle associativity and precedence
                    if (
                        (LogicalExpressionParser.getAssociativity(op1) === 'left' && LogicalExpressionParser.getPrecedence(op1) <= LogicalExpressionParser.getPrecedence(op2)) ||
                        (LogicalExpressionParser.getAssociativity(op1) === 'right' && LogicalExpressionParser.getPrecedence(op1) < LogicalExpressionParser.getPrecedence(op2))
                    ) {
                        outputQueue.push(operatorStack.pop());
                    } else {
                        break;
                    }
                }
                operatorStack.push(op1);
            } else {
                // Operand (variable)
                outputQueue.push(token);
            }
        }

        while (operatorStack.length > 0) {
            const op = operatorStack.pop();
            if (op === '(' || op === ')') {
                throw new Error('Mismatched parentheses');
            }
            outputQueue.push(op);
        }
        return outputQueue;
    }

    buildCircuitFromRPN(rpnTokens: string[]) {
        const operandStack: { id: string }[] = []; // Stores { id: string }

        for (const token of rpnTokens) {
            if (LogicalExpressionParser.isOperator(token)) {
                const operatorInfo = LogicalExpressionParser.OPERATORS[token];
                const gateType = operatorInfo.type;
                const arity = operatorInfo.arity;

                if (operandStack.length < arity) throw new Error(`Not enough operands for operator ${token}`);

                const operands: { id: string }[] = [];
                for (let i = 0; i < arity; i++) {
                    operands.unshift(operandStack.pop()!);
                }

                const inputs = operands.map(op => op.id);
                let newElementId;

                if (gateType === 'NOT') {
                    // Special handling for NOT: NAND with duplicated input
                    if (inputs.length !== 1) throw new Error('NOT operator expects exactly one input');
                    const inputId = inputs[0];
                    newElementId = `NAND_${this.idCounters.NAND++}`;
                    this.elements.push({ id: newElementId, type: 'NAND', inputs: [inputId, inputId], layer: 1 });
                } else {
                    newElementId = `${gateType}_${this.idCounters[gateType]++}`;
                    this.elements.push({ id: newElementId, type: gateType, inputs: inputs, layer: 1 });
                }
                operandStack.push({ id: newElementId });

            } else {
                // Operand (variable or previous gate output)
                operandStack.push(this.resolveInput(token));
            }
        }

        if (operandStack.length !== 1) {
            throw new Error('Invalid RPN expression: remaining operands on stack');
        }
        return operandStack.pop()!;
    }

    resolveInput(inputName: string) {
        // If it's a previously assigned variable, return its element ID
        let id;
        if (id = this.variableMap.get(inputName)) {
            return { id: id };
        }

        // If it's a new input variable (e.g., 'A', 'B', 'C', 'D' etc.)
        // Create an INPUT element for it. Layer will be calculated later.
        if (inputName.match(/^[a-zA-Z][a-zA-Z0-9]*$/) && !inputName.match(/^L\d+$/)) {
            id = inputName; // Use inputName directly as ID for INPUT type
            const type = (inputName.match(/^(S|B)\d+$/)) ? (id[0] === "B" ? "BUTTON" : "SWITCH") : "INPUT";
            this.elements.push({ id: id, type: type, inputs: [], layer: 1 });
            this.variableMap.set(inputName, id); // Map variable name to its ID
            return { id: id };
        }

        throw new Error(`Unresolved input: ${inputName}`);
    }

    // Step 3: Flatten associative gates (e.g., A & B & C should be one AND gate with 3 inputs)
    flattenAssociativeGates() {
        const elementsToRemove = new Set();
        for (const element of this.elements) {
            const operatorInfo = Object.values(LogicalExpressionParser.OPERATORS).find(op => op.type === element.type);
            if (operatorInfo && operatorInfo.associative) {
                const newInputs = [];
                for (const inputId of element.inputs) {
                    const inputElement = this.elements.find((el: { id: any; }) => el.id === inputId);
                    if (inputElement && inputElement.type === element.type) {
                        newInputs.push(...inputElement.inputs);
                        elementsToRemove.add(inputId);
                    } else {
                        newInputs.push(inputId);
                    }
                }
                element.inputs = [...new Set(newInputs)];
            }
        }
        this.elements = this.elements.filter((el: { id: unknown; }) => !elementsToRemove.has(el.id));
    }

    // Step 4: Recalculate layers based on dependencies
    recalculateLayers() {
        let changed = true;
        while (changed) {
            changed = false;
            for (const element of this.elements) {
                if (element.type === 'INPUT') continue;

                let maxInputLayer = 0;
                for (const inputId of element.inputs) {
                    const inputElement = this.elements.find((el: { id: any; }) => el.id === inputId);
                    if (inputElement) {
                        maxInputLayer = Math.max(maxInputLayer, inputElement.layer || 0);
                    } else {
                        // If an input is not an element (e.g., a direct variable like 'A' not yet resolved to an INPUT gate)
                        // this implies an issue in resolveInput or element creation logic.
                        // For now, assume it's an implicit input at layer 1.
                        maxInputLayer = Math.max(maxInputLayer, 1);
                    }
                }

                const newLayer = maxInputLayer + 1;
                this.lastLayer = Math.max(newLayer, this.lastLayer);
                if (element.layer !== newLayer) {
                    element.layer = newLayer;
                    changed = true;
                }
            }
        }
    }

    getLayers() {
        const layers:Element[][] = [];
        for (let i = this.lastLayer; i--;) layers.push([]);

        for (const element of this.elements) {
            layers[element.layer - 1].push(element); 
        }
        return layers;
    }
}

// Export for testing or use
export { LogicalExpressionParser };