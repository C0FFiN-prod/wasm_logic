// parser.ts - Исправленная версия с поддержкой смешанных операторов
import {
    Program, FunctionDecl, StatementList,
    AssignStmt, CallAssignStmt, ExprStmt, ReturnStmt,
    Identifier, Literal, UnaryOp, NaryOp, CallExpr, GroupExpr, BinaryOp,
    type Position,
    Declaration,
    Expr,
    Stmt
} from './ast';
import { type Token } from './lexer';

export class Parser {
    private tokens: Token[] = [];
    private current = 0;
    private errors: ParseError[] = [];

    constructor() { }

    // Вспомогательные методы (остаются без изменений)
    private isAtEnd(): boolean {
        return this.peek().type === 'EOF';
    }

    private peek(): Token {
        return this.tokens[this.current]!;
    }

    private previous(): Token {
        return this.tokens[this.current - 1]!;
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private check(type: string): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private match(...types: string[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    private consume(type: string, message: string): Token|null {
        if (this.check(type)) return this.advance();
        const err  = this.error(this.peek(), message);
        if ([
            'OP_LPAREN','OP_RPAREN',
            'OP_ASSIGN','OP_SEMICOLON',
            'OP_LBRACE','OP_RBRACE',
        ].includes(type)) return null;
        throw err;
    }

    private error(token: Token, message: string): ParseError {
        const error = new ParseError(token, message);
        this.errors.push(error);
        return error;
    }

    private getPosition(token: Token): Position {
        return {
            line: token.line || 1,
            column: token.column || 1,
            offset: token.position
        };
    }

    // Основной метод парсинга (остается без изменений)
    parse(tokens: Token[]): Program {
        this.tokens = tokens;
        this.current = 0;
        this.errors = [];
        const declarations: Declaration[] = [];

        try {
            while (!this.isAtEnd()) {
                declarations.push(this.parseDeclaration());
            }
        } catch (e) {
            if (e instanceof ParseError) {
                this.synchronize();
            } else {
                throw e;
            }
        }

        return new Program(declarations);
    }

    // Декларации и операторы (остаются без изменений)
    private parseDeclaration(): Declaration {
        if (this.isFunctionDeclaration()) {
            return this.parseFunctionDecl();
        } else {
            return this.parseStatementList();
        }
    }

    private isFunctionDeclaration(): boolean {
        const saved = this.current;

        try {
            if (!this.match('IDENTIFIER')) return false;
            if (!this.match('OP_LPAREN')) return false;

            if (this.match('IDENTIFIER')) {
                while (this.match('OP_COMMA')) {
                    if (!this.match('IDENTIFIER')) return false;
                }
            }

            if (!this.match('OP_RPAREN')) return false;
            if (!this.match('OP_ASSIGN')) return false;
            return this.check('OP_LBRACE');
        } finally {
            this.current = saved;
        }
    }

    private parseFunctionDecl(): FunctionDecl {
        const startToken = this.peek();
        const position = this.getPosition(startToken);

        const name = this.consume('IDENTIFIER', 'expected-function-name')!.lexeme;
        this.consume('OP_LPAREN', "expected-left-paren-after-function-name");

        const params: string[] = [];
        if (!this.check('OP_RPAREN')) {
            do {
                params.push(this.consume('IDENTIFIER', 'expected-parameter')!.lexeme);
            } while (this.match('OP_COMMA'));
        }

        this.consume('OP_RPAREN', "expected-right-paren-after-params");
        this.consume('OP_ASSIGN', "expected-equal-after-signature");
        this.consume('OP_LBRACE', "expected-left-brace-after-equal");

        const body = this.parseStmtList();
        this.consume('OP_RBRACE', "expected-right-brace-after-body");

        return new FunctionDecl(name, params, body, position);
    }

    private parseStatementList(): StatementList {
        const startToken = this.peek();
        const position = this.getPosition(startToken);
        const statements: Stmt[] = [];

        while (!this.isAtEnd() && !this.check('OP_RBRACE')) {
            statements.push(this.parseStatement());
        }

        return new StatementList(statements, position);
    }

    private parseStmtList(): Stmt[] {
        const statements: Stmt[] = [];

        while (!this.check('OP_RBRACE') && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }

        return statements;
    }

    private parseStatement(): Stmt {
        const startToken = this.peek();
        const position = this.getPosition(startToken);

        if (this.match('OP_RETURN')) {
            return this.parseReturnStmt(startToken);
        }

        const identifiers: string[] = [];

        if (this.match('IDENTIFIER')) {
            identifiers.push(this.previous().lexeme);

            while (this.match('OP_COMMA')) {
                identifiers.push(this.consume('IDENTIFIER', 'expected-identifier-after-comma')!.lexeme);
            }
        } else {
            const expr = this.parseExpression();
            this.consume('OP_SEMICOLON', "expected-semicolon-after-expression");
            return new ExprStmt(expr, position);
        }

        if (this.match('OP_ASSIGN')) {
            if (this.check('IDENTIFIER') &&
                this.tokens[this.current + 1]?.type === 'OP_LPAREN') {
                const callee = this.consume('IDENTIFIER', "expected-function-name")!.lexeme;
                this.consume('OP_LPAREN', "expected-left-paren-after-function-name");
                const args = this.parseOptionalExprList();
                this.consume('OP_RPAREN', "expected-right-paren-after-args");
                this.consume('OP_SEMICOLON', "expected-semicolon-after-call");
                return new CallAssignStmt(identifiers, callee, args, position);
            } else {
                const values = this.parseExprList();
                this.consume('OP_SEMICOLON', "expected-semicolon-after-expression-list");
                return new AssignStmt(identifiers, values, position);
            }
        } else {
            this.current -= identifiers.length * 2 - 1;
            const expr = this.parseExpression();
            this.consume('OP_SEMICOLON', "expected-semicolon-after-expression");
            return new ExprStmt(expr, position);
        }
    }

    private parseReturnStmt(startToken: Token): ReturnStmt {
        const position = this.getPosition(startToken);
        const values: Expr[] = [];

        if (!this.check('OP_SEMICOLON')) {
            values.push(this.parseExpression());
            while (this.match('OP_COMMA')) {
                values.push(this.parseExpression());
            }
        }

        this.consume('OP_SEMICOLON', "expected-semicolon-after-return");
        return new ReturnStmt(values, position);
    }

    // НОВАЯ ВЕРСИЯ: Парсинг выражений с поддержкой смешанных операторов
    private parseExpression(): Expr {
        return this.parseOr();
    }

    private parseOr(): Expr {
        return this.parseBinaryChain(
            () => this.parseXor(),
            ['OP_OR', 'OP_NOR']
        );
    }

    private parseXor(): Expr {
        return this.parseBinaryChain(
            () => this.parseAnd(),
            ['OP_XOR', 'OP_XNOR']
        );
    }

    private parseAnd(): Expr {
        return this.parseBinaryChain(
            () => this.parseUnary(),
            ['OP_AND', 'OP_NAND']
        );
    }

    /**
     * Парсит цепочку бинарных операторов одного уровня приоритета
     * Обрабатывает как одинаковые, так и смешанные операторы
     */
    private parseBinaryChain(
        parseOperand: () => Expr,
        operatorTypes: string[]
    ): Expr {
        let left = parseOperand();

        while (this.match(...operatorTypes)) {
            const operator = this.previous().lexeme as '&' | '&!' | '^' | '^!' | '|' | '|!';
            const right = parseOperand();

            // Для ассоциативных операторов строим N-арное дерево
            if (this.isAssociativeOperator(operator)) {
                left = this.buildAssociativeChain(left, operator, right);
            } else {
                // Для неассоциативных - просто бинарный оператор
                const position = this.getPosition(this.previous());
                left = new BinaryOp(operator, left, right, position);
            }
        }

        return left;
    }

    /**
     * Строит N-арное дерево для ассоциативных операторов
     * Объединяет одинаковые операторы в один NaryOp
     */
    private buildAssociativeChain(left: Expr, operator: string, right: Expr): Expr {
        // Если левая часть уже NaryOp с тем же оператором
        if (left instanceof NaryOp && left.op === operator) {
            // Если правая часть тоже NaryOp с тем же оператором - объединяем
            if (right instanceof NaryOp && right.op === operator) {
                left.operands.push(...right.operands);
                return left;
            } else {
                // Просто добавляем правый операнд
                left.operands.push(right);
                return left;
            }
        }

        // Если правая часть NaryOp с тем же оператором
        if (right instanceof NaryOp && right.op === operator) {
            const position = left.position;
            const operands = [left, ...right.operands];
            return new NaryOp(operator as any, operands, position);
        }

        // Создаем новый NaryOp с двумя операндами
        const position = left.position;
        return new NaryOp(operator as any, [left, right], position);
    }

    /**
     * Проверяет, является ли оператор ассоциативным
     */
    private isAssociativeOperator(operator: string): boolean {
        // В нашей грамматике: &, |, ^ - ассоциативные
        // &!, |!, ^! - не ассоциативные
        return ['&' , '&!' , '^' , '^!' , '|' , '|!'].includes(operator);
    }

    private parseUnary(): Expr {
        if (this.match('OP_NOT')) {
            const opToken = this.previous();
            const expr = this.parseUnary();
            return new UnaryOp('!', expr, this.getPosition(opToken));
        }

        return this.parsePrimary();
    }

    private parsePrimary(): Expr {
        const startToken = this.peek();
        const position = this.getPosition(startToken);

        if (this.match('NUMBER')) {
            const value = this.previous().lexeme === '1' ? 1 : 0;
            return new Literal(value, position);
        }

        if (this.match('IDENTIFIER')) {
            const name = this.previous().lexeme;

            if (this.match('OP_LPAREN')) {
                const args = this.parseOptionalExprList();
                this.consume('OP_RPAREN', "expected-right-paren-after-args");
                return new CallExpr(name, args, position);
            }

            return new Identifier(name, position);
        }

        if (this.match('OP_LPAREN')) {
            const expr = this.parseExpression();
            this.consume('OP_RPAREN', "expected-right-paren-after-expression");
            return new GroupExpr(expr, this.getPosition(startToken));
        }

        throw this.error(startToken, 'expected-expression');
    }

    private parseExprList(): Expr[] {
        const exprs: Expr[] = [this.parseExpression()];

        while (this.match('OP_COMMA')) {
            exprs.push(this.parseExpression());
        }

        return exprs;
    }

    private parseOptionalExprList(): Expr[] {
        if (this.check('OP_RPAREN')) {
            return [];
        }
        return this.parseExprList();
    }

    private synchronize(): void {
        this.advance();

        while (!this.isAtEnd()) {
            if (this.previous().type === 'OP_SEMICOLON') return;

            switch (this.peek().type) {
                case 'IDENTIFIER':
                case 'OP_RETURN':
                case 'OP_LBRACE':
                    return;
            }

            this.advance();
        }
    }

    getErrors(): ParseError[] {
        return this.errors;
    }
}

export class ParseError extends Error {
    constructor(
        public token: Token,
        message: string
    ) {
        super(message);
        this.name = 'ParseError';
    }
}