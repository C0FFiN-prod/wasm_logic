// main.ts - Объединение парсера AST и CircuitBuilder
import { Lexer, LexerError, type Token } from './lexer';
import { ParseError, Parser } from './parser';
import { BuildError, CircuitBuilder, type CircuitLayers } from './circuitBuilder';
import type { Program } from './ast';
export {LexerError, BuildError, ParseError};
export class LogEqLangCompiler {
    private lexer: Lexer;
    private parser: Parser;
    private circuitBuilder: CircuitBuilder;

    constructor() {
        this.lexer = new Lexer();
        this.parser = new Parser();
        this.circuitBuilder = new CircuitBuilder();
    }

    highlighter(source: string, pos: number, width:number) : string {
        let i = pos;
        let j = pos;
        while (i > 0 && source[i] != '\n' && pos - i < 15) --i;
        while (j < source.length && source[j] != '\n' && j - pos < 30 - (pos - i)) ++j;
        return source.slice(i, j) + '\n'+' '.repeat(pos - i) + '^' + '~'.repeat(width-1);
    }

    tokenize(source: string) {
        return this.lexer.tokenize(source);
    }
    parse(tokens: Token[]) {
        return {ast: this.parser.parse(tokens),
                errors: this.parser.getErrors()}
    }
    buildFromAst(ast: Program, flatten = true) {
        return this.circuitBuilder.buildFromAST(ast, flatten);
    }

    /**
     * Компиляция исходного кода в схему
     */
    compile(source: string, flatten = true): {
        ast: any,
        layers: any[][],
        errors: any[]
    } {
        try {
            // 1. Лексический анализ
            const tokens = this.lexer.tokenize(source);

            // 2. Синтаксический анализ (построение AST)
            const ast = this.parser.parse(tokens);

            // 3. Преобразование AST в схему
            const layers = this.circuitBuilder.buildFromAST(ast, flatten);

            return {
                ast: ast,
                layers: layers,
                errors: this.parser.getErrors()
            };

        } catch (error) {
            // console.error('Ошибка компиляции:', error);
            throw error;
        }
    }

    /**
     * Компиляция с выводом отладочной информации
     */
    compileWithDebug(source: string, flatten = true): void {
        console.log('=== Компиляция BoolLang ===\n');
        console.log('Исходный код:');
        console.log(source);
        console.log('\n' + '='.repeat(50));

        try {
            const result = this.compile(source, flatten);

            console.log('\n1. AST:');
            this.printAST(result.ast);

            console.log('\n2. Схема:');
            this.printCircuit(result.layers);
            // console.log(JSON.stringify(result.layers,null,2))
            if (result.errors.length > 0) {
                console.log('\nОшибки:');
                result.errors.forEach(err =>
                    console.log(`  - [${err.token.line}:${err.token.column}] ${err.message}`));
            }

        } catch (error: any) {
            if (error instanceof LexerError) {
                this.highlighter(source, error.pos, error.width);
                console.log(error.message+": " + error.value);
            } else {
                console.error('\nКритическая ошибка:', error.message);
            }
        }
    }

    /**
     * Печать AST
     */
    printAST(node: any, indent = ''): void {
        const typeName = node.constructor.name;
        console.log(`${indent}${typeName}`);

        if (node.declarations) {
            node.declarations.forEach((decl: any) => this.printAST(decl, indent + '  '));
        } else if (node.body) {
            node.body.forEach((stmt: any) => this.printAST(stmt, indent + '  '));
        } else if (node.statements) {
            node.statements.forEach((stmt: any) => this.printAST(stmt, indent + '  '));
        } else if (node.expr) {
            this.printAST(node.expr, indent + '  ');
        } else if (node.values && Array.isArray(node.values)) {
            node.values.forEach((val: any) => this.printAST(val, indent + '  '));
        } else if (node.left && node.right) {
            this.printAST(node.left, indent + '  ');
            this.printAST(node.right, indent + '  ');
        } else if (node.operands) {
            for (const operand of node.operands) {
                this.printAST(operand, indent + '  ');
            }
        }
    }
    printCircuit(layers: CircuitLayers): void {
        console.log('Схема:');
        console.log(`Всего слоев: ${layers.length}`);

        for (let i = 0; i < layers.length; i++) {
            console.log(`\nСлой ${i + 1}:`);
            for (const element of layers[i]!) {
                console.log(`  ${element.id} [${element.type}] -> inputs: [${element.inputs.join(', ')}]`);
            }
        }
    }
}
/*
// Примеры использования
const compiler = new LogEqLangCompiler();

// Пример 0: Простая схема
const example0 = `
    // Пример полусумматора
    HA1(A, B) = { < A & B, A ^ B; }
    HA2(A, B) = { < A & B, A ^ B; }
    _DDD = J & Z & H;
    L = (J & Z) & H;
    R = J & (Z & H);
    R = J | (0 | H);
    R = J & (Z | H | F);
    R = J & (1 |! Z |! H |! F);
    
    // Использование
    L1, L2 = HA1(S1 ^ S2, S2 & S3);
`;
// Пример 1: Простая схема
const example1 = `
    // Пример полусумматора
    HA(A, B) = {
        C = A & B;
        S = A ^ B;
        < C, S;
    }
    
    // Использование
    X, Y = HA(S1, S2);
    L1 = X;
    L2 = Y;
`;

// Пример 2: Сложное выражение
const example2 = `
    A = S1 &! S2;
    B = S3 |! S4;
    C = A ^! B;
    L1 = C;
`;

// Пример 3: Множественное присваивание
const example3 = `
    FUNC(X, Y) = {
        A = X & Y;
        B = X | Y;
        < A, B;
    }
    
    P, Q = FUNC(S1, S2);
    L1 = P;
    L2 = Q;
`;

// Пример 4: Множественное присваивание
const example4 = `
A0 = S0;
A1 = S1;
A2 = S2;
A3 = S3;
D0 = S4;
D1 = S5;
D2 = S6;
D3 = S7;
C0 = S8;


P0 = A0 ^ D0;
G0 = A0 & D0;

P1 = A1 ^ D1;
G1 = A1 & D1;

P2 = A2 ^ D2;
G2 = A2 & D2;

P3 = A3 ^ D3;
G3 = A3 & D3;

C1 = G0 | (P0 & C0);

C2 = G1 | (P1 & G0) | (P1 & P0 & C0);

C3 = G2 | (P2 & G1) | (P2 & P1 & G0) | (P2 & P1 & P0 & C0);

C4 = G3 | (P3 & G2) | (P3 & P2 & G1) | (P3 & P2 & P1 & G0) | (P3 & P2 & P1 & P0 & C0);

L0 = P0 ^ C0;
L1 = P1 ^ C1;
L2 = P2 ^ C2;
L3 = P3 ^ C3;
L4 = C4;
`;

// Запуск компиляции
console.log('Запуск компиляции примеров...\n');

try {
    console.log('Пример 0:');
    compiler.compileWithDebug(example0);

    console.log('Пример 1:');
    compiler.compileWithDebug(example1);

    console.log('\n\nПример 2:');
    compiler.compileWithDebug(example2);

    console.log('\n\nПример 3:');
    compiler.compileWithDebug(example3);

    console.log('\n\nПример 4:');
    compiler.compileWithDebug(example4);

} catch (error) {
    console.error('Ошибка:', error);
}
*/