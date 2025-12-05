// Дополнительно: Улучшенный лексер с поддержкой позиций
export interface Token {
    type: string;
    lexeme: string;
    position: number;
    line: number;
    column: number;
}

export class LexerError extends Error {
    constructor(
        message: string,
        public value: string,
        public pos: number,
        public width: number,
    ) {
        super(message);
        this.name = 'LexerError';
    }
}

export class Lexer {
    private source: string = '';
    private tokens: Token[] = [];
    private start: number = 0;
    private current: number = 0;
    private line: number = 1;
    private column: number = 1;

    // Операторы в порядке убывания длины
    private static OPERATORS = [
        '&!', '^!', '|!',
        '&', '^', '|', '!',
        '=', ',', ';', '(', ')', '{', '}', '<'
    ];//.sort((a, b) => b.length - a.length);

    tokenize(source: string): Token[] {
        this.source = source;
        this.tokens = [];
        this.start = 0;
        this.current = 0;
        this.line = 1;
        this.column = 1;

        while (!this.isAtEnd()) {
            this.start = this.current;
            this.scanToken();
        }

        this.tokens.push({
            type: 'EOF',
            lexeme: '',
            position: this.current,
            line: this.line,
            column: this.column
        });

        return this.tokens;
    }

    private isAtEnd(): boolean {
        return this.current >= this.source.length;
    }

    private advance(): string {
        const char = this.source.charAt(this.current++);
        if (char === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return char;
    }

    private peek(): string {
        if (this.isAtEnd()) return '\0';
        return this.source.charAt(this.current);
    }

    private peekNext(): string {
        if (this.current + 1 >= this.source.length) return '\0';
        return this.source.charAt(this.current + 1);
    }

    private match(expected: string): boolean {
        if (this.isAtEnd()) return false;
        if (this.source.charAt(this.current) !== expected) return false;

        this.current++;
        this.column++;
        return true;
    }

    private addToken(type: string, lexeme?: string): void {
        const text = lexeme || this.source.substring(this.start, this.current);
        this.tokens.push({
            type,
            lexeme: text,
            position: this.start,
            line: this.line,
            column: this.column - text.length
        });
    }

    private scanToken(): void {
        const c = this.advance();

        switch (c) {
            case ' ':
            case '\t':
            case '\r':
                // Пропускаем пробельные символы
                break;

            case '\n':
                // Уже обработано в advance()
                break;

            case '/':
                if (this.match('/')) {
                    // Однострочный комментарий
                    while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
                } else if (this.match('*')) {
                    // Многострочный комментарий
                    while (!(this.peek() === '*' && this.peekNext() === '/') && !this.isAtEnd()) {
                        this.advance();
                    }
                    if (!this.isAtEnd()) {
                        this.advance(); // *
                        this.advance(); // /
                    }
                } else {
                    this.error('unexpected-character', c, this.current, 1);
                }
                break;

            default:
                if (this.isDigit(c)) {
                    this.number();
                }else if (this.isAlpha(c)) {
                    this.identifier();
                } else {
                    this.operator();
                }
                break;
        }
    }

    private isDigit(c: string): boolean {
        return c >= '0' && c <= '9'; // Только 0 и 1 для битов
    }
    private isBit(c: string): boolean {
        return c >= '0' && c <= '1'; // Только 0 и 1 для битов
    }

    private isAlpha(c: string): boolean {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            c === '_';
    }

    private isAlphaNumeric(c: string): boolean {
        return this.isAlpha(c) || this.isDigit(c);
    }

    private number(): void {
        while (this.isDigit(this.peek())) this.advance();

        const value = this.source.substring(this.start, this.current);
        if (value !== '0' && value !== '1') {
            this.error('invalid-number', value, this.start, value.length);
        }

        this.addToken('NUMBER');
    }

    private identifier(): void {
        while (this.isAlphaNumeric(this.peek())) this.advance();

        const value = this.source.substring(this.start, this.current);
        if (value === 'CONST_0' || value === 'CONST_1') {
            this.error('invalid-identifier', value, this.start, value.length);
        }

        this.addToken('IDENTIFIER');
    }

    private operator(): void {
        // Пытаемся найти самый длинный оператор
        let found = false;
        for (const op of Lexer.OPERATORS) {
            if (this.source.startsWith(op, this.start)) {
                this.current = this.start + op.length;
                this.column += op.length - 1;

                const type = this.getOperatorType(op);
                this.addToken(type, op);
                found = true;
                break;
            }
        }

        if (!found) {
            this.error('unknown-operator', this.source.charAt(this.start), this.start, 1);
        }
    }

    private getOperatorType(op: string): string {
        switch (op) {
            case '&!': return 'OP_NAND';
            case '^!': return 'OP_XNOR';
            case '|!': return 'OP_NOR';
            case '!': return 'OP_NOT';
            case '&': return 'OP_AND';
            case '^': return 'OP_XOR';
            case '|': return 'OP_OR';
            case '=': return 'OP_ASSIGN';
            case ',': return 'OP_COMMA';
            case ';': return 'OP_SEMICOLON';
            case '(': return 'OP_LPAREN';
            case ')': return 'OP_RPAREN';
            case '{': return 'OP_LBRACE';
            case '}': return 'OP_RBRACE';
            case '<': return 'OP_RETURN';
            default: this.error('unknown-operator', op, this.start, op.length);
        }
        return "";
    }

    private error(message: string, value:string, pos: number, width: number): void {
        throw new LexerError(`[${this.line}:${this.column}] ${message}`, value, pos, width);
    }
}