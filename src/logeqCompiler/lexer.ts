// Дополнительно: Улучшенный лексер с поддержкой позиций
export interface Token {
    type: string;
    lexeme: string;
    position: number;
    line: number;
    column: number;
}

export class Lexer {
    private source: string = '';
    private tokens: Token[] = [];
    private start: number = 0;
    private current: number = 0;
    private line: number = 1;
    private column: number = 1;
    private skipComments: boolean = true;

    private static OPERATORS = new Map(Object.entries({
        '&!':'OP_NAND',
        '^!':'OP_XNOR',
        '|!':'OP_NOR',
        '!': 'OP_NOT',
        '&': 'OP_AND',
        '^': 'OP_XOR',
        '|': 'OP_OR',
        '=': 'OP_ASSIGN',
        ',': 'OP_COMMA',
        ';': 'OP_SEMICOLON',
        '(': 'OP_LPAREN',
        ')': 'OP_RPAREN',
        '{': 'OP_LBRACE',
        '}': 'OP_RBRACE',
        '<': 'OP_RETURN',
    }));
    private static MAX_OP_LENGTH = Lexer.OPERATORS.keys().reduce((m, c) => c.length > m.length ? c : m ).length;
    private unknownTokens: (Token & {type: string})[] = [];

    tokenize(source: string, skipComments: boolean = true) {
        this.skipComments = skipComments;
        this.source = source;
        this.tokens = [];
        this.unknownTokens = [];
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

        return [this.tokens, this.unknownTokens];
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

    private addToken(type: string, lexeme?: string, errType?: string): void {
        const text = lexeme || this.source.substring(this.start, this.current);
        const token = {
            type,
            lexeme: text,
            position: this.start,
            line: this.line,
            column: this.column - text.length
        }
        if (type === 'UNKNOWN') {
            token.type = errType || 'unknown-token';
            this.unknownTokens.push(token);  
        }
        else this.tokens.push(token);
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
                    if(!this.skipComments) this.addToken('COMMENT');
                } else if (this.match('*')) {
                    // Многострочный комментарий
                    while (!(this.peek() === '*' && this.peekNext() === '/') && !this.isAtEnd()) {
                        this.advance();
                    }
                    if (!this.isAtEnd()) {
                        this.advance(); // *
                        this.advance(); // /
                    }
                    if(!this.skipComments) this.addToken('COMMENT');
                } else {
                    this.addToken('UNKNOWN', '/', 'unknown-operator');
                }
                break;

            default:
                if (this.isDigit(c)) {
                    this.number();
                } else if (this.isAlpha(c)) {
                    this.identifier();
                } else if (this.operator()){
                    ;
                } else {
                    while (![' ', '\t', '\r', '\n'].includes(this.peek()) && !this.isAtEnd()) this.advance();
                    this.addToken('UNKNOWN');
                }
                break;
        }
    }

    private isDigit(c: string): boolean {
        return c >= '0' && c <= '9';
    }
    private isBit(c: string): boolean {
        return c >= '0' && c <= '1';
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
            this.addToken('UNKNOWN', value, 'invalid-number');
        } else {
            this.addToken('NUMBER');
        }

    }

    private identifier(): void {
        while (this.isAlphaNumeric(this.peek())) this.advance();

        const value = this.source.substring(this.start, this.current);
        if (value === 'CONST_0' || value === 'CONST_1') {
            // this.error('invalid-identifier', value, this.start, value.length);
            this.addToken('UNKNOWN', value, 'invalid-identifier');
        }

        this.addToken('IDENTIFIER');
    }

    private operator(): boolean {
        let op = this.source.slice(this.start, this.start + Lexer.MAX_OP_LENGTH);
        let type: string | undefined;
        for (let i = Lexer.MAX_OP_LENGTH; i-- > 0;){
            if (type = Lexer.OPERATORS.get(op)) {
                this.current = this.start + op.length;
                this.column += op.length - 1;
                this.addToken(type, op);
                return true;
            }
            op = op.slice(0, i);
        }
        return false;
    }
}