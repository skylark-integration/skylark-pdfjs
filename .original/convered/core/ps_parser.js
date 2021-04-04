define([
    '../shared/util.js',
    './primitives.js',
    './core_utils.js'
], function (a, b, c) {
    'use strict';
    class PostScriptParser {
        constructor(lexer) {
            this.lexer = lexer;
            this.operators = [];
            this.token = null;
            this.prev = null;
        }
        nextToken() {
            this.prev = this.token;
            this.token = this.lexer.getToken();
        }
        accept(type) {
            if (this.token.type === type) {
                this.nextToken();
                return true;
            }
            return false;
        }
        expect(type) {
            if (this.accept(type)) {
                return true;
            }
            throw new a.FormatError(`Unexpected symbol: found ${ this.token.type } expected ${ type }.`);
        }
        parse() {
            this.nextToken();
            this.expect(PostScriptTokenTypes.LBRACE);
            this.parseBlock();
            this.expect(PostScriptTokenTypes.RBRACE);
            return this.operators;
        }
        parseBlock() {
            while (true) {
                if (this.accept(PostScriptTokenTypes.NUMBER)) {
                    this.operators.push(this.prev.value);
                } else if (this.accept(PostScriptTokenTypes.OPERATOR)) {
                    this.operators.push(this.prev.value);
                } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
                    this.parseCondition();
                } else {
                    return;
                }
            }
        }
        parseCondition() {
            const conditionLocation = this.operators.length;
            this.operators.push(null, null);
            this.parseBlock();
            this.expect(PostScriptTokenTypes.RBRACE);
            if (this.accept(PostScriptTokenTypes.IF)) {
                this.operators[conditionLocation] = this.operators.length;
                this.operators[conditionLocation + 1] = 'jz';
            } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
                const jumpLocation = this.operators.length;
                this.operators.push(null, null);
                const endOfTrue = this.operators.length;
                this.parseBlock();
                this.expect(PostScriptTokenTypes.RBRACE);
                this.expect(PostScriptTokenTypes.IFELSE);
                this.operators[jumpLocation] = this.operators.length;
                this.operators[jumpLocation + 1] = 'j';
                this.operators[conditionLocation] = endOfTrue;
                this.operators[conditionLocation + 1] = 'jz';
            } else {
                throw new a.FormatError('PS Function: error parsing conditional.');
            }
        }
    }
    const PostScriptTokenTypes = {
        LBRACE: 0,
        RBRACE: 1,
        NUMBER: 2,
        OPERATOR: 3,
        IF: 4,
        IFELSE: 5
    };
    const PostScriptToken = function PostScriptTokenClosure() {
        const opCache = Object.create(null);
        class PostScriptToken {
            constructor(type, value) {
                this.type = type;
                this.value = value;
            }
            static getOperator(op) {
                const opValue = opCache[op];
                if (opValue) {
                    return opValue;
                }
                return opCache[op] = new PostScriptToken(PostScriptTokenTypes.OPERATOR, op);
            }
            static get LBRACE() {
                return a.shadow(this, 'LBRACE', new PostScriptToken(PostScriptTokenTypes.LBRACE, '{'));
            }
            static get RBRACE() {
                return a.shadow(this, 'RBRACE', new PostScriptToken(PostScriptTokenTypes.RBRACE, '}'));
            }
            static get IF() {
                return a.shadow(this, 'IF', new PostScriptToken(PostScriptTokenTypes.IF, 'IF'));
            }
            static get IFELSE() {
                return a.shadow(this, 'IFELSE', new PostScriptToken(PostScriptTokenTypes.IFELSE, 'IFELSE'));
            }
        }
        return PostScriptToken;
    }();
    class PostScriptLexer {
        constructor(stream) {
            this.stream = stream;
            this.nextChar();
            this.strBuf = [];
        }
        nextChar() {
            return this.currentChar = this.stream.getByte();
        }
        getToken() {
            let comment = false;
            let ch = this.currentChar;
            while (true) {
                if (ch < 0) {
                    return b.EOF;
                }
                if (comment) {
                    if (ch === 10 || ch === 13) {
                        comment = false;
                    }
                } else if (ch === 37) {
                    comment = true;
                } else if (!c.isWhiteSpace(ch)) {
                    break;
                }
                ch = this.nextChar();
            }
            switch (ch | 0) {
            case 48:
            case 49:
            case 50:
            case 51:
            case 52:
            case 53:
            case 54:
            case 55:
            case 56:
            case 57:
            case 43:
            case 45:
            case 46:
                return new PostScriptToken(PostScriptTokenTypes.NUMBER, this.getNumber());
            case 123:
                this.nextChar();
                return PostScriptToken.LBRACE;
            case 125:
                this.nextChar();
                return PostScriptToken.RBRACE;
            }
            const strBuf = this.strBuf;
            strBuf.length = 0;
            strBuf[0] = String.fromCharCode(ch);
            while ((ch = this.nextChar()) >= 0 && (ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122)) {
                strBuf.push(String.fromCharCode(ch));
            }
            const str = strBuf.join('');
            switch (str.toLowerCase()) {
            case 'if':
                return PostScriptToken.IF;
            case 'ifelse':
                return PostScriptToken.IFELSE;
            default:
                return PostScriptToken.getOperator(str);
            }
        }
        getNumber() {
            let ch = this.currentChar;
            const strBuf = this.strBuf;
            strBuf.length = 0;
            strBuf[0] = String.fromCharCode(ch);
            while ((ch = this.nextChar()) >= 0) {
                if (ch >= 48 && ch <= 57 || ch === 45 || ch === 46) {
                    strBuf.push(String.fromCharCode(ch));
                } else {
                    break;
                }
            }
            const value = parseFloat(strBuf.join(''));
            if (isNaN(value)) {
                throw new a.FormatError(`Invalid floating point number: ${ value }`);
            }
            return value;
        }
    }
    return {
        PostScriptLexer,
        PostScriptParser
    };
});