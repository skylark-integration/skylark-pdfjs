define([
    './stream.js',
    '../shared/util.js',
    './primitives.js',
    './core_utils.js',
    './ccitt_stream.js',
    './jbig2_stream.js',
    './jpeg_stream.js',
    './jpx_stream.js'
], function (a, b, c, d, e, f, g, h) {
    'use strict';
    const MAX_LENGTH_TO_CACHE = 1000;
    const MAX_ADLER32_LENGTH = 5552;
    function computeAdler32(bytes) {
        const bytesLength = bytes.length;
        if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
            b.assert(bytesLength < MAX_ADLER32_LENGTH, 'computeAdler32: Unsupported "bytes" length.');
        }
        let a = 1, b = 0;
        for (let i = 0; i < bytesLength; ++i) {
            a += bytes[i] & 255;
            b += a;
        }
        return b % 65521 << 16 | a % 65521;
    }
    class Parser {
        constructor({lexer, xref, allowStreams = false, recoveryMode = false}) {
            this.lexer = lexer;
            this.xref = xref;
            this.allowStreams = allowStreams;
            this.recoveryMode = recoveryMode;
            this.imageCache = Object.create(null);
            this.refill();
        }
        refill() {
            this.buf1 = this.lexer.getObj();
            this.buf2 = this.lexer.getObj();
        }
        shift() {
            if (this.buf2 instanceof c.Cmd && this.buf2.cmd === 'ID') {
                this.buf1 = this.buf2;
                this.buf2 = null;
            } else {
                this.buf1 = this.buf2;
                this.buf2 = this.lexer.getObj();
            }
        }
        tryShift() {
            try {
                this.shift();
                return true;
            } catch (e) {
                if (e instanceof d.MissingDataException) {
                    throw e;
                }
                return false;
            }
        }
        getObj(cipherTransform = null) {
            const buf1 = this.buf1;
            this.shift();
            if (buf1 instanceof c.Cmd) {
                switch (buf1.cmd) {
                case 'BI':
                    return this.makeInlineImage(cipherTransform);
                case '[':
                    const array = [];
                    while (!c.isCmd(this.buf1, ']') && !c.isEOF(this.buf1)) {
                        array.push(this.getObj(cipherTransform));
                    }
                    if (c.isEOF(this.buf1)) {
                        if (!this.recoveryMode) {
                            throw new b.FormatError('End of file inside array');
                        }
                        return array;
                    }
                    this.shift();
                    return array;
                case '<<':
                    const dict = new c.Dict(this.xref);
                    while (!c.isCmd(this.buf1, '>>') && !c.isEOF(this.buf1)) {
                        if (!c.isName(this.buf1)) {
                            b.info('Malformed dictionary: key must be a name object');
                            this.shift();
                            continue;
                        }
                        const key = this.buf1.name;
                        this.shift();
                        if (c.isEOF(this.buf1)) {
                            break;
                        }
                        dict.set(key, this.getObj(cipherTransform));
                    }
                    if (c.isEOF(this.buf1)) {
                        if (!this.recoveryMode) {
                            throw new b.FormatError('End of file inside dictionary');
                        }
                        return dict;
                    }
                    if (c.isCmd(this.buf2, 'stream')) {
                        return this.allowStreams ? this.makeStream(dict, cipherTransform) : dict;
                    }
                    this.shift();
                    return dict;
                default:
                    return buf1;
                }
            }
            if (Number.isInteger(buf1)) {
                if (Number.isInteger(this.buf1) && c.isCmd(this.buf2, 'R')) {
                    const ref = c.Ref.get(buf1, this.buf1);
                    this.shift();
                    this.shift();
                    return ref;
                }
                return buf1;
            }
            if (typeof buf1 === 'string') {
                if (cipherTransform) {
                    return cipherTransform.decryptString(buf1);
                }
                return buf1;
            }
            return buf1;
        }
        findDefaultInlineStreamEnd(stream) {
            const E = 69, I = 73, SPACE = 32, LF = 10, CR = 13, NUL = 0;
            const lexer = this.lexer, startPos = stream.pos, n = 10;
            let state = 0, ch, maybeEIPos;
            while ((ch = stream.getByte()) !== -1) {
                if (state === 0) {
                    state = ch === E ? 1 : 0;
                } else if (state === 1) {
                    state = ch === I ? 2 : 0;
                } else {
                    b.assert(state === 2, 'findDefaultInlineStreamEnd - invalid state.');
                    if (ch === SPACE || ch === LF || ch === CR) {
                        maybeEIPos = stream.pos;
                        const followingBytes = stream.peekBytes(n);
                        for (let i = 0, ii = followingBytes.length; i < ii; i++) {
                            ch = followingBytes[i];
                            if (ch === NUL && followingBytes[i + 1] !== NUL) {
                                continue;
                            }
                            if (ch !== LF && ch !== CR && (ch < SPACE || ch > 127)) {
                                state = 0;
                                break;
                            }
                        }
                        if (state !== 2) {
                            continue;
                        }
                        if (lexer.knownCommands) {
                            const nextObj = lexer.peekObj();
                            if (nextObj instanceof c.Cmd && !lexer.knownCommands[nextObj.cmd]) {
                                state = 0;
                            }
                        } else {
                            b.warn('findDefaultInlineStreamEnd - `lexer.knownCommands` is undefined.');
                        }
                        if (state === 2) {
                            break;
                        }
                    } else {
                        state = 0;
                    }
                }
            }
            if (ch === -1) {
                b.warn('findDefaultInlineStreamEnd: ' + 'Reached the end of the stream without finding a valid EI marker');
                if (maybeEIPos) {
                    b.warn('... trying to recover by using the last "EI" occurrence.');
                    stream.skip(-(stream.pos - maybeEIPos));
                }
            }
            let endOffset = 4;
            stream.skip(-endOffset);
            ch = stream.peekByte();
            stream.skip(endOffset);
            if (!d.isWhiteSpace(ch)) {
                endOffset--;
            }
            return stream.pos - endOffset - startPos;
        }
        findDCTDecodeInlineStreamEnd(stream) {
            const startPos = stream.pos;
            let foundEOI = false, b, markerLength;
            while ((b = stream.getByte()) !== -1) {
                if (b !== 255) {
                    continue;
                }
                switch (stream.getByte()) {
                case 0:
                    break;
                case 255:
                    stream.skip(-1);
                    break;
                case 217:
                    foundEOI = true;
                    break;
                case 192:
                case 193:
                case 194:
                case 195:
                case 197:
                case 198:
                case 199:
                case 201:
                case 202:
                case 203:
                case 205:
                case 206:
                case 207:
                case 196:
                case 204:
                case 218:
                case 219:
                case 220:
                case 221:
                case 222:
                case 223:
                case 224:
                case 225:
                case 226:
                case 227:
                case 228:
                case 229:
                case 230:
                case 231:
                case 232:
                case 233:
                case 234:
                case 235:
                case 236:
                case 237:
                case 238:
                case 239:
                case 254:
                    markerLength = stream.getUint16();
                    if (markerLength > 2) {
                        stream.skip(markerLength - 2);
                    } else {
                        stream.skip(-2);
                    }
                    break;
                }
                if (foundEOI) {
                    break;
                }
            }
            const length = stream.pos - startPos;
            if (b === -1) {
                b.warn('Inline DCTDecode image stream: ' + 'EOI marker not found, searching for /EI/ instead.');
                stream.skip(-length);
                return this.findDefaultInlineStreamEnd(stream);
            }
            this.inlineStreamSkipEI(stream);
            return length;
        }
        findASCII85DecodeInlineStreamEnd(stream) {
            const TILDE = 126, GT = 62;
            const startPos = stream.pos;
            let ch;
            while ((ch = stream.getByte()) !== -1) {
                if (ch === TILDE) {
                    const tildePos = stream.pos;
                    ch = stream.peekByte();
                    while (d.isWhiteSpace(ch)) {
                        stream.skip();
                        ch = stream.peekByte();
                    }
                    if (ch === GT) {
                        stream.skip();
                        break;
                    }
                    if (stream.pos > tildePos) {
                        const maybeEI = stream.peekBytes(2);
                        if (maybeEI[0] === 69 && maybeEI[1] === 73) {
                            break;
                        }
                    }
                }
            }
            const length = stream.pos - startPos;
            if (ch === -1) {
                b.warn('Inline ASCII85Decode image stream: ' + 'EOD marker not found, searching for /EI/ instead.');
                stream.skip(-length);
                return this.findDefaultInlineStreamEnd(stream);
            }
            this.inlineStreamSkipEI(stream);
            return length;
        }
        findASCIIHexDecodeInlineStreamEnd(stream) {
            const GT = 62;
            const startPos = stream.pos;
            let ch;
            while ((ch = stream.getByte()) !== -1) {
                if (ch === GT) {
                    break;
                }
            }
            const length = stream.pos - startPos;
            if (ch === -1) {
                b.warn('Inline ASCIIHexDecode image stream: ' + 'EOD marker not found, searching for /EI/ instead.');
                stream.skip(-length);
                return this.findDefaultInlineStreamEnd(stream);
            }
            this.inlineStreamSkipEI(stream);
            return length;
        }
        inlineStreamSkipEI(stream) {
            const E = 69, I = 73;
            let state = 0, ch;
            while ((ch = stream.getByte()) !== -1) {
                if (state === 0) {
                    state = ch === E ? 1 : 0;
                } else if (state === 1) {
                    state = ch === I ? 2 : 0;
                } else if (state === 2) {
                    break;
                }
            }
        }
        makeInlineImage(cipherTransform) {
            const lexer = this.lexer;
            const stream = lexer.stream;
            const dict = new c.Dict(this.xref);
            let dictLength;
            while (!c.isCmd(this.buf1, 'ID') && !c.isEOF(this.buf1)) {
                if (!c.isName(this.buf1)) {
                    throw new b.FormatError('Dictionary key must be a name object');
                }
                const key = this.buf1.name;
                this.shift();
                if (c.isEOF(this.buf1)) {
                    break;
                }
                dict.set(key, this.getObj(cipherTransform));
            }
            if (lexer.beginInlineImagePos !== -1) {
                dictLength = stream.pos - lexer.beginInlineImagePos;
            }
            const filter = dict.get('Filter', 'F');
            let filterName;
            if (c.isName(filter)) {
                filterName = filter.name;
            } else if (Array.isArray(filter)) {
                const filterZero = this.xref.fetchIfRef(filter[0]);
                if (c.isName(filterZero)) {
                    filterName = filterZero.name;
                }
            }
            const startPos = stream.pos;
            let length;
            if (filterName === 'DCTDecode' || filterName === 'DCT') {
                length = this.findDCTDecodeInlineStreamEnd(stream);
            } else if (filterName === 'ASCII85Decode' || filterName === 'A85') {
                length = this.findASCII85DecodeInlineStreamEnd(stream);
            } else if (filterName === 'ASCIIHexDecode' || filterName === 'AHx') {
                length = this.findASCIIHexDecodeInlineStreamEnd(stream);
            } else {
                length = this.findDefaultInlineStreamEnd(stream);
            }
            let imageStream = stream.makeSubStream(startPos, length, dict);
            let cacheKey;
            if (length < MAX_LENGTH_TO_CACHE && dictLength < MAX_ADLER32_LENGTH) {
                const imageBytes = imageStream.getBytes();
                imageStream.reset();
                const initialStreamPos = stream.pos;
                stream.pos = lexer.beginInlineImagePos;
                const dictBytes = stream.getBytes(dictLength);
                stream.pos = initialStreamPos;
                cacheKey = computeAdler32(imageBytes) + '_' + computeAdler32(dictBytes);
                const cacheEntry = this.imageCache[cacheKey];
                if (cacheEntry !== undefined) {
                    this.buf2 = c.Cmd.get('EI');
                    this.shift();
                    cacheEntry.reset();
                    return cacheEntry;
                }
            }
            if (cipherTransform) {
                imageStream = cipherTransform.createStream(imageStream, length);
            }
            imageStream = this.filter(imageStream, dict, length);
            imageStream.dict = dict;
            if (cacheKey !== undefined) {
                imageStream.cacheKey = `inline_${ length }_${ cacheKey }`;
                this.imageCache[cacheKey] = imageStream;
            }
            this.buf2 = c.Cmd.get('EI');
            this.shift();
            return imageStream;
        }
        _findStreamLength(startPos, signature) {
            const {stream} = this.lexer;
            stream.pos = startPos;
            const SCAN_BLOCK_LENGTH = 2048;
            const signatureLength = signature.length;
            while (stream.pos < stream.end) {
                const scanBytes = stream.peekBytes(SCAN_BLOCK_LENGTH);
                const scanLength = scanBytes.length - signatureLength;
                if (scanLength <= 0) {
                    break;
                }
                let pos = 0;
                while (pos < scanLength) {
                    let j = 0;
                    while (j < signatureLength && scanBytes[pos + j] === signature[j]) {
                        j++;
                    }
                    if (j >= signatureLength) {
                        stream.pos += pos;
                        return stream.pos - startPos;
                    }
                    pos++;
                }
                stream.pos += scanLength;
            }
            return -1;
        }
        makeStream(dict, cipherTransform) {
            const lexer = this.lexer;
            let stream = lexer.stream;
            lexer.skipToNextLine();
            const startPos = stream.pos - 1;
            let length = dict.get('Length');
            if (!Number.isInteger(length)) {
                b.info(`Bad length "${ length }" in stream`);
                length = 0;
            }
            stream.pos = startPos + length;
            lexer.nextChar();
            if (this.tryShift() && c.isCmd(this.buf2, 'endstream')) {
                this.shift();
            } else {
                const ENDSTREAM_SIGNATURE = new Uint8Array([
                    101,
                    110,
                    100,
                    115,
                    116,
                    114,
                    101,
                    97,
                    109
                ]);
                let actualLength = this._findStreamLength(startPos, ENDSTREAM_SIGNATURE);
                if (actualLength < 0) {
                    const MAX_TRUNCATION = 1;
                    for (let i = 1; i <= MAX_TRUNCATION; i++) {
                        const end = ENDSTREAM_SIGNATURE.length - i;
                        const TRUNCATED_SIGNATURE = ENDSTREAM_SIGNATURE.slice(0, end);
                        const maybeLength = this._findStreamLength(startPos, TRUNCATED_SIGNATURE);
                        if (maybeLength >= 0) {
                            const lastByte = stream.peekBytes(end + 1)[end];
                            if (!d.isWhiteSpace(lastByte)) {
                                break;
                            }
                            b.info(`Found "${ b.bytesToString(TRUNCATED_SIGNATURE) }" when ` + 'searching for endstream command.');
                            actualLength = maybeLength;
                            break;
                        }
                    }
                    if (actualLength < 0) {
                        throw new b.FormatError('Missing endstream command.');
                    }
                }
                length = actualLength;
                lexer.nextChar();
                this.shift();
                this.shift();
            }
            this.shift();
            stream = stream.makeSubStream(startPos, length, dict);
            if (cipherTransform) {
                stream = cipherTransform.createStream(stream, length);
            }
            stream = this.filter(stream, dict, length);
            stream.dict = dict;
            return stream;
        }
        filter(stream, dict, length) {
            let filter = dict.get('Filter', 'F');
            let params = dict.get('DecodeParms', 'DP');
            if (c.isName(filter)) {
                if (Array.isArray(params)) {
                    b.warn('/DecodeParms should not contain an Array, ' + 'when /Filter contains a Name.');
                }
                return this.makeFilter(stream, filter.name, length, params);
            }
            let maybeLength = length;
            if (Array.isArray(filter)) {
                const filterArray = filter;
                const paramsArray = params;
                for (let i = 0, ii = filterArray.length; i < ii; ++i) {
                    filter = this.xref.fetchIfRef(filterArray[i]);
                    if (!c.isName(filter)) {
                        throw new b.FormatError(`Bad filter name "${ filter }"`);
                    }
                    params = null;
                    if (Array.isArray(paramsArray) && i in paramsArray) {
                        params = this.xref.fetchIfRef(paramsArray[i]);
                    }
                    stream = this.makeFilter(stream, filter.name, maybeLength, params);
                    maybeLength = null;
                }
            }
            return stream;
        }
        makeFilter(stream, name, maybeLength, params) {
            if (maybeLength === 0) {
                b.warn(`Empty "${ name }" stream.`);
                return new a.NullStream();
            }
            try {
                const xrefStreamStats = this.xref.stats.streamTypes;
                if (name === 'FlateDecode' || name === 'Fl') {
                    xrefStreamStats[b.StreamType.FLATE] = true;
                    if (params) {
                        return new a.PredictorStream(new a.FlateStream(stream, maybeLength), maybeLength, params);
                    }
                    return new a.FlateStream(stream, maybeLength);
                }
                if (name === 'LZWDecode' || name === 'LZW') {
                    xrefStreamStats[b.StreamType.LZW] = true;
                    let earlyChange = 1;
                    if (params) {
                        if (params.has('EarlyChange')) {
                            earlyChange = params.get('EarlyChange');
                        }
                        return new a.PredictorStream(new a.LZWStream(stream, maybeLength, earlyChange), maybeLength, params);
                    }
                    return new a.LZWStream(stream, maybeLength, earlyChange);
                }
                if (name === 'DCTDecode' || name === 'DCT') {
                    xrefStreamStats[b.StreamType.DCT] = true;
                    return new g.JpegStream(stream, maybeLength, stream.dict, params);
                }
                if (name === 'JPXDecode' || name === 'JPX') {
                    xrefStreamStats[b.StreamType.JPX] = true;
                    return new h.JpxStream(stream, maybeLength, stream.dict, params);
                }
                if (name === 'ASCII85Decode' || name === 'A85') {
                    xrefStreamStats[b.StreamType.A85] = true;
                    return new a.Ascii85Stream(stream, maybeLength);
                }
                if (name === 'ASCIIHexDecode' || name === 'AHx') {
                    xrefStreamStats[b.StreamType.AHX] = true;
                    return new a.AsciiHexStream(stream, maybeLength);
                }
                if (name === 'CCITTFaxDecode' || name === 'CCF') {
                    xrefStreamStats[b.StreamType.CCF] = true;
                    return new e.CCITTFaxStream(stream, maybeLength, params);
                }
                if (name === 'RunLengthDecode' || name === 'RL') {
                    xrefStreamStats[b.StreamType.RLX] = true;
                    return new a.RunLengthStream(stream, maybeLength);
                }
                if (name === 'JBIG2Decode') {
                    xrefStreamStats[b.StreamType.JBIG] = true;
                    return new f.Jbig2Stream(stream, maybeLength, stream.dict, params);
                }
                b.warn(`Filter "${ name }" is not supported.`);
                return stream;
            } catch (ex) {
                if (ex instanceof d.MissingDataException) {
                    throw ex;
                }
                b.warn(`Invalid stream: "${ ex }"`);
                return new a.NullStream();
            }
        }
    }
    const specialChars = [
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1,
        0,
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        2,
        0,
        0,
        2,
        2,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    ];
    function toHexDigit(ch) {
        if (ch >= 48 && ch <= 57) {
            return ch & 15;
        }
        if (ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102) {
            return (ch & 15) + 9;
        }
        return -1;
    }
    class Lexer {
        constructor(stream, knownCommands = null) {
            this.stream = stream;
            this.nextChar();
            this.strBuf = [];
            this.knownCommands = knownCommands;
            this._hexStringNumWarn = 0;
            this.beginInlineImagePos = -1;
        }
        nextChar() {
            return this.currentChar = this.stream.getByte();
        }
        peekChar() {
            return this.stream.peekByte();
        }
        getNumber() {
            let ch = this.currentChar;
            let eNotation = false;
            let divideBy = 0;
            let sign = 0;
            if (ch === 45) {
                sign = -1;
                ch = this.nextChar();
                if (ch === 45) {
                    ch = this.nextChar();
                }
            } else if (ch === 43) {
                sign = 1;
                ch = this.nextChar();
            }
            if (ch === 10 || ch === 13) {
                do {
                    ch = this.nextChar();
                } while (ch === 10 || ch === 13);
            }
            if (ch === 46) {
                divideBy = 10;
                ch = this.nextChar();
            }
            if (ch < 48 || ch > 57) {
                if (divideBy === 10 && sign === 0 && (d.isWhiteSpace(ch) || ch === -1)) {
                    b.warn('Lexer.getNumber - treating a single decimal point as zero.');
                    return 0;
                }
                throw new b.FormatError(`Invalid number: ${ String.fromCharCode(ch) } (charCode ${ ch })`);
            }
            sign = sign || 1;
            let baseValue = ch - 48;
            let powerValue = 0;
            let powerValueSign = 1;
            while ((ch = this.nextChar()) >= 0) {
                if (ch >= 48 && ch <= 57) {
                    const currentDigit = ch - 48;
                    if (eNotation) {
                        powerValue = powerValue * 10 + currentDigit;
                    } else {
                        if (divideBy !== 0) {
                            divideBy *= 10;
                        }
                        baseValue = baseValue * 10 + currentDigit;
                    }
                } else if (ch === 46) {
                    if (divideBy === 0) {
                        divideBy = 1;
                    } else {
                        break;
                    }
                } else if (ch === 45) {
                    b.warn('Badly formatted number: minus sign in the middle');
                } else if (ch === 69 || ch === 101) {
                    ch = this.peekChar();
                    if (ch === 43 || ch === 45) {
                        powerValueSign = ch === 45 ? -1 : 1;
                        this.nextChar();
                    } else if (ch < 48 || ch > 57) {
                        break;
                    }
                    eNotation = true;
                } else {
                    break;
                }
            }
            if (divideBy !== 0) {
                baseValue /= divideBy;
            }
            if (eNotation) {
                baseValue *= 10 ** (powerValueSign * powerValue);
            }
            return sign * baseValue;
        }
        getString() {
            let numParen = 1;
            let done = false;
            const strBuf = this.strBuf;
            strBuf.length = 0;
            let ch = this.nextChar();
            while (true) {
                let charBuffered = false;
                switch (ch | 0) {
                case -1:
                    b.warn('Unterminated string');
                    done = true;
                    break;
                case 40:
                    ++numParen;
                    strBuf.push('(');
                    break;
                case 41:
                    if (--numParen === 0) {
                        this.nextChar();
                        done = true;
                    } else {
                        strBuf.push(')');
                    }
                    break;
                case 92:
                    ch = this.nextChar();
                    switch (ch) {
                    case -1:
                        b.warn('Unterminated string');
                        done = true;
                        break;
                    case 110:
                        strBuf.push('\n');
                        break;
                    case 114:
                        strBuf.push('\r');
                        break;
                    case 116:
                        strBuf.push('\t');
                        break;
                    case 98:
                        strBuf.push('\b');
                        break;
                    case 102:
                        strBuf.push('\f');
                        break;
                    case 92:
                    case 40:
                    case 41:
                        strBuf.push(String.fromCharCode(ch));
                        break;
                    case 48:
                    case 49:
                    case 50:
                    case 51:
                    case 52:
                    case 53:
                    case 54:
                    case 55:
                        let x = ch & 15;
                        ch = this.nextChar();
                        charBuffered = true;
                        if (ch >= 48 && ch <= 55) {
                            x = (x << 3) + (ch & 15);
                            ch = this.nextChar();
                            if (ch >= 48 && ch <= 55) {
                                charBuffered = false;
                                x = (x << 3) + (ch & 15);
                            }
                        }
                        strBuf.push(String.fromCharCode(x));
                        break;
                    case 13:
                        if (this.peekChar() === 10) {
                            this.nextChar();
                        }
                        break;
                    case 10:
                        break;
                    default:
                        strBuf.push(String.fromCharCode(ch));
                        break;
                    }
                    break;
                default:
                    strBuf.push(String.fromCharCode(ch));
                    break;
                }
                if (done) {
                    break;
                }
                if (!charBuffered) {
                    ch = this.nextChar();
                }
            }
            return strBuf.join('');
        }
        getName() {
            let ch, previousCh;
            const strBuf = this.strBuf;
            strBuf.length = 0;
            while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
                if (ch === 35) {
                    ch = this.nextChar();
                    if (specialChars[ch]) {
                        b.warn('Lexer_getName: ' + 'NUMBER SIGN (#) should be followed by a hexadecimal number.');
                        strBuf.push('#');
                        break;
                    }
                    const x = toHexDigit(ch);
                    if (x !== -1) {
                        previousCh = ch;
                        ch = this.nextChar();
                        const x2 = toHexDigit(ch);
                        if (x2 === -1) {
                            b.warn(`Lexer_getName: Illegal digit (${ String.fromCharCode(ch) }) ` + 'in hexadecimal number.');
                            strBuf.push('#', String.fromCharCode(previousCh));
                            if (specialChars[ch]) {
                                break;
                            }
                            strBuf.push(String.fromCharCode(ch));
                            continue;
                        }
                        strBuf.push(String.fromCharCode(x << 4 | x2));
                    } else {
                        strBuf.push('#', String.fromCharCode(ch));
                    }
                } else {
                    strBuf.push(String.fromCharCode(ch));
                }
            }
            if (strBuf.length > 127) {
                b.warn(`Name token is longer than allowed by the spec: ${ strBuf.length }`);
            }
            return c.Name.get(strBuf.join(''));
        }
        _hexStringWarn(ch) {
            const MAX_HEX_STRING_NUM_WARN = 5;
            if (this._hexStringNumWarn++ === MAX_HEX_STRING_NUM_WARN) {
                b.warn('getHexString - ignoring additional invalid characters.');
                return;
            }
            if (this._hexStringNumWarn > MAX_HEX_STRING_NUM_WARN) {
                return;
            }
            b.warn(`getHexString - ignoring invalid character: ${ ch }`);
        }
        getHexString() {
            const strBuf = this.strBuf;
            strBuf.length = 0;
            let ch = this.currentChar;
            let isFirstHex = true;
            let firstDigit, secondDigit;
            this._hexStringNumWarn = 0;
            while (true) {
                if (ch < 0) {
                    b.warn('Unterminated hex string');
                    break;
                } else if (ch === 62) {
                    this.nextChar();
                    break;
                } else if (specialChars[ch] === 1) {
                    ch = this.nextChar();
                    continue;
                } else {
                    if (isFirstHex) {
                        firstDigit = toHexDigit(ch);
                        if (firstDigit === -1) {
                            this._hexStringWarn(ch);
                            ch = this.nextChar();
                            continue;
                        }
                    } else {
                        secondDigit = toHexDigit(ch);
                        if (secondDigit === -1) {
                            this._hexStringWarn(ch);
                            ch = this.nextChar();
                            continue;
                        }
                        strBuf.push(String.fromCharCode(firstDigit << 4 | secondDigit));
                    }
                    isFirstHex = !isFirstHex;
                    ch = this.nextChar();
                }
            }
            return strBuf.join('');
        }
        getObj() {
            let comment = false;
            let ch = this.currentChar;
            while (true) {
                if (ch < 0) {
                    return c.EOF;
                }
                if (comment) {
                    if (ch === 10 || ch === 13) {
                        comment = false;
                    }
                } else if (ch === 37) {
                    comment = true;
                } else if (specialChars[ch] !== 1) {
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
                return this.getNumber();
            case 40:
                return this.getString();
            case 47:
                return this.getName();
            case 91:
                this.nextChar();
                return c.Cmd.get('[');
            case 93:
                this.nextChar();
                return c.Cmd.get(']');
            case 60:
                ch = this.nextChar();
                if (ch === 60) {
                    this.nextChar();
                    return c.Cmd.get('<<');
                }
                return this.getHexString();
            case 62:
                ch = this.nextChar();
                if (ch === 62) {
                    this.nextChar();
                    return c.Cmd.get('>>');
                }
                return c.Cmd.get('>');
            case 123:
                this.nextChar();
                return c.Cmd.get('{');
            case 125:
                this.nextChar();
                return c.Cmd.get('}');
            case 41:
                this.nextChar();
                throw new b.FormatError(`Illegal character: ${ ch }`);
            }
            let str = String.fromCharCode(ch);
            const knownCommands = this.knownCommands;
            let knownCommandFound = knownCommands && knownCommands[str] !== undefined;
            while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
                const possibleCommand = str + String.fromCharCode(ch);
                if (knownCommandFound && knownCommands[possibleCommand] === undefined) {
                    break;
                }
                if (str.length === 128) {
                    throw new b.FormatError(`Command token too long: ${ str.length }`);
                }
                str = possibleCommand;
                knownCommandFound = knownCommands && knownCommands[str] !== undefined;
            }
            if (str === 'true') {
                return true;
            }
            if (str === 'false') {
                return false;
            }
            if (str === 'null') {
                return null;
            }
            if (str === 'BI') {
                this.beginInlineImagePos = this.stream.pos;
            }
            return c.Cmd.get(str);
        }
        peekObj() {
            const streamPos = this.stream.pos, currentChar = this.currentChar, beginInlineImagePos = this.beginInlineImagePos;
            let nextObj;
            try {
                nextObj = this.getObj();
            } catch (ex) {
                if (ex instanceof d.MissingDataException) {
                    throw ex;
                }
                b.warn(`peekObj: ${ ex }`);
            }
            this.stream.pos = streamPos;
            this.currentChar = currentChar;
            this.beginInlineImagePos = beginInlineImagePos;
            return nextObj;
        }
        skipToNextLine() {
            let ch = this.currentChar;
            while (ch >= 0) {
                if (ch === 13) {
                    ch = this.nextChar();
                    if (ch === 10) {
                        this.nextChar();
                    }
                    break;
                } else if (ch === 10) {
                    this.nextChar();
                    break;
                }
                ch = this.nextChar();
            }
        }
    }
    class Linearization {
        static create(stream) {
            function getInt(linDict, name, allowZeroValue = false) {
                const obj = linDict.get(name);
                if (Number.isInteger(obj) && (allowZeroValue ? obj >= 0 : obj > 0)) {
                    return obj;
                }
                throw new Error(`The "${ name }" parameter in the linearization ` + 'dictionary is invalid.');
            }
            function getHints(linDict) {
                const hints = linDict.get('H');
                let hintsLength;
                if (Array.isArray(hints) && ((hintsLength = hints.length) === 2 || hintsLength === 4)) {
                    for (let index = 0; index < hintsLength; index++) {
                        const hint = hints[index];
                        if (!(Number.isInteger(hint) && hint > 0)) {
                            throw new Error(`Hint (${ index }) in the linearization dictionary is invalid.`);
                        }
                    }
                    return hints;
                }
                throw new Error('Hint array in the linearization dictionary is invalid.');
            }
            const parser = new Parser({
                lexer: new Lexer(stream),
                xref: null
            });
            const obj1 = parser.getObj();
            const obj2 = parser.getObj();
            const obj3 = parser.getObj();
            const linDict = parser.getObj();
            let obj, length;
            if (!(Number.isInteger(obj1) && Number.isInteger(obj2) && c.isCmd(obj3, 'obj') && c.isDict(linDict) && b.isNum(obj = linDict.get('Linearized')) && obj > 0)) {
                return null;
            } else if ((length = getInt(linDict, 'L')) !== stream.length) {
                throw new Error('The "L" parameter in the linearization dictionary ' + 'does not equal the stream length.');
            }
            return {
                length,
                hints: getHints(linDict),
                objectNumberFirst: getInt(linDict, 'O'),
                endFirst: getInt(linDict, 'E'),
                numPages: getInt(linDict, 'N'),
                mainXRefEntriesOffset: getInt(linDict, 'T'),
                pageFirst: linDict.has('P') ? getInt(linDict, 'P', true) : 0
            };
        }
    }
    return {
        Lexer,
        Linearization,
        Parser
    };
});