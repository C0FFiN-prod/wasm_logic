// ast.ts - с поддержкой обоих типов операторов
export type Position = {
    line: number;
    column: number;
    offset: number;
};

export abstract class ASTNode {
    constructor(public position: Position) { }
}

export abstract class Expr extends ASTNode { }
export abstract class Stmt extends ASTNode { }
export abstract class Declaration extends ASTNode { }

// Выражения
export class Identifier extends Expr {
    constructor(public name: string, position: Position) {
        super(position);
    }
}

export class Literal extends Expr {
    constructor(public value: 0 | 1, position: Position) {
        super(position);
    }
}

export class UnaryOp extends Expr {
    constructor(
        public op: '!',
        public expr: Expr,
        position: Position
    ) {
        super(position);
    }
}

// BinaryOp для неассоциативных операторов и смешанных операторов
export class BinaryOp extends Expr {
    constructor(
        public op: '&' | '&!' | '^' | '^!' | '|' | '|!',
        public left: Expr,
        public right: Expr,
        position: Position
    ) {
        super(position);
    }
}

// N-арный оператор для ассоциативных операторов
export class NaryOp extends Expr {
    constructor(
        public op: '&' | '&!' | '^' | '^!' | '|' | '|!', // Только ассоциативные операторы
        public operands: Expr[], // 2 или более операндов
        position: Position
    ) {
        super(position);
    }
}

// Группирующее выражение (скобки)
export class GroupExpr extends Expr {
    constructor(
        public expr: Expr,
        position: Position
    ) {
        super(position);
    }
}

export class CallExpr extends Expr {
    constructor(
        public callee: string,
        public args: Expr[],
        position: Position
    ) {
        super(position);
    }
}

// Операторы (statements) - без изменений
export class AssignStmt extends Stmt {
    constructor(
        public targets: string[],
        public values: Expr[],
        position: Position
    ) {
        super(position);
    }
}

export class CallAssignStmt extends Stmt {
    constructor(
        public targets: string[],
        public callee: string,
        public args: Expr[],
        position: Position
    ) {
        super(position);
    }
}

export class ExprStmt extends Stmt {
    constructor(
        public expr: Expr,
        position: Position
    ) {
        super(position);
    }
}

export class ReturnStmt extends Stmt {
    constructor(
        public values: Expr[],
        position: Position
    ) {
        super(position);
    }
}

// Декларации - без изменений
export class FunctionDecl extends Declaration {
    constructor(
        public name: string,
        public params: string[],
        public body: Stmt[],
        position: Position
    ) {
        super(position);
    }
}

export class StatementList extends Declaration {
    constructor(
        public statements: Stmt[],
        position: Position
    ) {
        super(position);
    }
}

// Программа
export class Program extends ASTNode {
    constructor(
        public declarations: Declaration[]
    ) {
        super({ line: 1, column: 1, offset: 0 });
    }
}