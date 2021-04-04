define([
    '../shared/util.js',
    './primitives.js',
    './core_utils.js'
], function (a, b, c) {
    'use strict';
    var Stream = function StreamClosure() {
        function Stream(arrayBuffer, start, length, dict) {
            this.bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
            this.start = start || 0;
            this.pos = this.start;
            this.end = start + length || this.bytes.length;
            this.dict = dict;
        }
        Stream.prototype = {
            get length() {
                return this.end - this.start;
            },
            get isEmpty() {
                return this.length === 0;
            },
            getByte: function Stream_getByte() {
                if (this.pos >= this.end) {
                    return -1;
                }
                return this.bytes[this.pos++];
            },
            getUint16: function Stream_getUint16() {
                var b0 = this.getByte();
                var b1 = this.getByte();
                if (b0 === -1 || b1 === -1) {
                    return -1;
                }
                return (b0 << 8) + b1;
            },
            getInt32: function Stream_getInt32() {
                var b0 = this.getByte();
                var b1 = this.getByte();
                var b2 = this.getByte();
                var b3 = this.getByte();
                return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
            },
            getBytes(length, forceClamped = false) {
                var bytes = this.bytes;
                var pos = this.pos;
                var strEnd = this.end;
                if (!length) {
                    const subarray = bytes.subarray(pos, strEnd);
                    return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
                }
                var end = pos + length;
                if (end > strEnd) {
                    end = strEnd;
                }
                this.pos = end;
                const subarray = bytes.subarray(pos, end);
                return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
            },
            peekByte: function Stream_peekByte() {
                var peekedByte = this.getByte();
                if (peekedByte !== -1) {
                    this.pos--;
                }
                return peekedByte;
            },
            peekBytes(length, forceClamped = false) {
                var bytes = this.getBytes(length, forceClamped);
                this.pos -= bytes.length;
                return bytes;
            },
            getByteRange(begin, end) {
                if (begin < 0) {
                    begin = 0;
                }
                if (end > this.end) {
                    end = this.end;
                }
                return this.bytes.subarray(begin, end);
            },
            skip: function Stream_skip(n) {
                if (!n) {
                    n = 1;
                }
                this.pos += n;
            },
            reset: function Stream_reset() {
                this.pos = this.start;
            },
            moveStart: function Stream_moveStart() {
                this.start = this.pos;
            },
            makeSubStream: function Stream_makeSubStream(start, length, dict) {
                return new Stream(this.bytes.buffer, start, length, dict);
            }
        };
        return Stream;
    }();
    var StringStream = function StringStreamClosure() {
        function StringStream(str) {
            const bytes = a.stringToBytes(str);
            Stream.call(this, bytes);
        }
        StringStream.prototype = Stream.prototype;
        return StringStream;
    }();
    var DecodeStream = function DecodeStreamClosure() {
        var emptyBuffer = new Uint8Array(0);
        function DecodeStream(maybeMinBufferLength) {
            this._rawMinBufferLength = maybeMinBufferLength || 0;
            this.pos = 0;
            this.bufferLength = 0;
            this.eof = false;
            this.buffer = emptyBuffer;
            this.minBufferLength = 512;
            if (maybeMinBufferLength) {
                while (this.minBufferLength < maybeMinBufferLength) {
                    this.minBufferLength *= 2;
                }
            }
        }
        DecodeStream.prototype = {
            get length() {
                a.unreachable('Should not access DecodeStream.length');
            },
            get isEmpty() {
                while (!this.eof && this.bufferLength === 0) {
                    this.readBlock();
                }
                return this.bufferLength === 0;
            },
            ensureBuffer: function DecodeStream_ensureBuffer(requested) {
                var buffer = this.buffer;
                if (requested <= buffer.byteLength) {
                    return buffer;
                }
                var size = this.minBufferLength;
                while (size < requested) {
                    size *= 2;
                }
                var buffer2 = new Uint8Array(size);
                buffer2.set(buffer);
                return this.buffer = buffer2;
            },
            getByte: function DecodeStream_getByte() {
                var pos = this.pos;
                while (this.bufferLength <= pos) {
                    if (this.eof) {
                        return -1;
                    }
                    this.readBlock();
                }
                return this.buffer[this.pos++];
            },
            getUint16: function DecodeStream_getUint16() {
                var b0 = this.getByte();
                var b1 = this.getByte();
                if (b0 === -1 || b1 === -1) {
                    return -1;
                }
                return (b0 << 8) + b1;
            },
            getInt32: function DecodeStream_getInt32() {
                var b0 = this.getByte();
                var b1 = this.getByte();
                var b2 = this.getByte();
                var b3 = this.getByte();
                return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
            },
            getBytes(length, forceClamped = false) {
                var end, pos = this.pos;
                if (length) {
                    this.ensureBuffer(pos + length);
                    end = pos + length;
                    while (!this.eof && this.bufferLength < end) {
                        this.readBlock();
                    }
                    var bufEnd = this.bufferLength;
                    if (end > bufEnd) {
                        end = bufEnd;
                    }
                } else {
                    while (!this.eof) {
                        this.readBlock();
                    }
                    end = this.bufferLength;
                }
                this.pos = end;
                const subarray = this.buffer.subarray(pos, end);
                return forceClamped && !(subarray instanceof Uint8ClampedArray) ? new Uint8ClampedArray(subarray) : subarray;
            },
            peekByte: function DecodeStream_peekByte() {
                var peekedByte = this.getByte();
                if (peekedByte !== -1) {
                    this.pos--;
                }
                return peekedByte;
            },
            peekBytes(length, forceClamped = false) {
                var bytes = this.getBytes(length, forceClamped);
                this.pos -= bytes.length;
                return bytes;
            },
            makeSubStream: function DecodeStream_makeSubStream(start, length, dict) {
                var end = start + length;
                while (this.bufferLength <= end && !this.eof) {
                    this.readBlock();
                }
                return new Stream(this.buffer, start, length, dict);
            },
            getByteRange(begin, end) {
                a.unreachable('Should not call DecodeStream.getByteRange');
            },
            skip: function DecodeStream_skip(n) {
                if (!n) {
                    n = 1;
                }
                this.pos += n;
            },
            reset: function DecodeStream_reset() {
                this.pos = 0;
            },
            getBaseStreams: function DecodeStream_getBaseStreams() {
                if (this.str && this.str.getBaseStreams) {
                    return this.str.getBaseStreams();
                }
                return [];
            }
        };
        return DecodeStream;
    }();
    var StreamsSequenceStream = function StreamsSequenceStreamClosure() {
        function StreamsSequenceStream(streams) {
            this.streams = streams;
            let maybeLength = 0;
            for (let i = 0, ii = streams.length; i < ii; i++) {
                const stream = streams[i];
                if (stream instanceof DecodeStream) {
                    maybeLength += stream._rawMinBufferLength;
                } else {
                    maybeLength += stream.length;
                }
            }
            DecodeStream.call(this, maybeLength);
        }
        StreamsSequenceStream.prototype = Object.create(DecodeStream.prototype);
        StreamsSequenceStream.prototype.readBlock = function streamSequenceStreamReadBlock() {
            var streams = this.streams;
            if (streams.length === 0) {
                this.eof = true;
                return;
            }
            var stream = streams.shift();
            var chunk = stream.getBytes();
            var bufferLength = this.bufferLength;
            var newLength = bufferLength + chunk.length;
            var buffer = this.ensureBuffer(newLength);
            buffer.set(chunk, bufferLength);
            this.bufferLength = newLength;
        };
        StreamsSequenceStream.prototype.getBaseStreams = function StreamsSequenceStream_getBaseStreams() {
            var baseStreams = [];
            for (var i = 0, ii = this.streams.length; i < ii; i++) {
                var stream = this.streams[i];
                if (stream.getBaseStreams) {
                    baseStreams.push(...stream.getBaseStreams());
                }
            }
            return baseStreams;
        };
        return StreamsSequenceStream;
    }();
    var FlateStream = function FlateStreamClosure() {
        var codeLenCodeMap = new Int32Array([
            16,
            17,
            18,
            0,
            8,
            7,
            9,
            6,
            10,
            5,
            11,
            4,
            12,
            3,
            13,
            2,
            14,
            1,
            15
        ]);
        var lengthDecode = new Int32Array([
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            65547,
            65549,
            65551,
            65553,
            131091,
            131095,
            131099,
            131103,
            196643,
            196651,
            196659,
            196667,
            262211,
            262227,
            262243,
            262259,
            327811,
            327843,
            327875,
            327907,
            258,
            258,
            258
        ]);
        var distDecode = new Int32Array([
            1,
            2,
            3,
            4,
            65541,
            65543,
            131081,
            131085,
            196625,
            196633,
            262177,
            262193,
            327745,
            327777,
            393345,
            393409,
            459009,
            459137,
            524801,
            525057,
            590849,
            591361,
            657409,
            658433,
            724993,
            727041,
            794625,
            798721,
            868353,
            876545
        ]);
        var fixedLitCodeTab = [
            new Int32Array([
                459008,
                524368,
                524304,
                524568,
                459024,
                524400,
                524336,
                590016,
                459016,
                524384,
                524320,
                589984,
                524288,
                524416,
                524352,
                590048,
                459012,
                524376,
                524312,
                589968,
                459028,
                524408,
                524344,
                590032,
                459020,
                524392,
                524328,
                590000,
                524296,
                524424,
                524360,
                590064,
                459010,
                524372,
                524308,
                524572,
                459026,
                524404,
                524340,
                590024,
                459018,
                524388,
                524324,
                589992,
                524292,
                524420,
                524356,
                590056,
                459014,
                524380,
                524316,
                589976,
                459030,
                524412,
                524348,
                590040,
                459022,
                524396,
                524332,
                590008,
                524300,
                524428,
                524364,
                590072,
                459009,
                524370,
                524306,
                524570,
                459025,
                524402,
                524338,
                590020,
                459017,
                524386,
                524322,
                589988,
                524290,
                524418,
                524354,
                590052,
                459013,
                524378,
                524314,
                589972,
                459029,
                524410,
                524346,
                590036,
                459021,
                524394,
                524330,
                590004,
                524298,
                524426,
                524362,
                590068,
                459011,
                524374,
                524310,
                524574,
                459027,
                524406,
                524342,
                590028,
                459019,
                524390,
                524326,
                589996,
                524294,
                524422,
                524358,
                590060,
                459015,
                524382,
                524318,
                589980,
                459031,
                524414,
                524350,
                590044,
                459023,
                524398,
                524334,
                590012,
                524302,
                524430,
                524366,
                590076,
                459008,
                524369,
                524305,
                524569,
                459024,
                524401,
                524337,
                590018,
                459016,
                524385,
                524321,
                589986,
                524289,
                524417,
                524353,
                590050,
                459012,
                524377,
                524313,
                589970,
                459028,
                524409,
                524345,
                590034,
                459020,
                524393,
                524329,
                590002,
                524297,
                524425,
                524361,
                590066,
                459010,
                524373,
                524309,
                524573,
                459026,
                524405,
                524341,
                590026,
                459018,
                524389,
                524325,
                589994,
                524293,
                524421,
                524357,
                590058,
                459014,
                524381,
                524317,
                589978,
                459030,
                524413,
                524349,
                590042,
                459022,
                524397,
                524333,
                590010,
                524301,
                524429,
                524365,
                590074,
                459009,
                524371,
                524307,
                524571,
                459025,
                524403,
                524339,
                590022,
                459017,
                524387,
                524323,
                589990,
                524291,
                524419,
                524355,
                590054,
                459013,
                524379,
                524315,
                589974,
                459029,
                524411,
                524347,
                590038,
                459021,
                524395,
                524331,
                590006,
                524299,
                524427,
                524363,
                590070,
                459011,
                524375,
                524311,
                524575,
                459027,
                524407,
                524343,
                590030,
                459019,
                524391,
                524327,
                589998,
                524295,
                524423,
                524359,
                590062,
                459015,
                524383,
                524319,
                589982,
                459031,
                524415,
                524351,
                590046,
                459023,
                524399,
                524335,
                590014,
                524303,
                524431,
                524367,
                590078,
                459008,
                524368,
                524304,
                524568,
                459024,
                524400,
                524336,
                590017,
                459016,
                524384,
                524320,
                589985,
                524288,
                524416,
                524352,
                590049,
                459012,
                524376,
                524312,
                589969,
                459028,
                524408,
                524344,
                590033,
                459020,
                524392,
                524328,
                590001,
                524296,
                524424,
                524360,
                590065,
                459010,
                524372,
                524308,
                524572,
                459026,
                524404,
                524340,
                590025,
                459018,
                524388,
                524324,
                589993,
                524292,
                524420,
                524356,
                590057,
                459014,
                524380,
                524316,
                589977,
                459030,
                524412,
                524348,
                590041,
                459022,
                524396,
                524332,
                590009,
                524300,
                524428,
                524364,
                590073,
                459009,
                524370,
                524306,
                524570,
                459025,
                524402,
                524338,
                590021,
                459017,
                524386,
                524322,
                589989,
                524290,
                524418,
                524354,
                590053,
                459013,
                524378,
                524314,
                589973,
                459029,
                524410,
                524346,
                590037,
                459021,
                524394,
                524330,
                590005,
                524298,
                524426,
                524362,
                590069,
                459011,
                524374,
                524310,
                524574,
                459027,
                524406,
                524342,
                590029,
                459019,
                524390,
                524326,
                589997,
                524294,
                524422,
                524358,
                590061,
                459015,
                524382,
                524318,
                589981,
                459031,
                524414,
                524350,
                590045,
                459023,
                524398,
                524334,
                590013,
                524302,
                524430,
                524366,
                590077,
                459008,
                524369,
                524305,
                524569,
                459024,
                524401,
                524337,
                590019,
                459016,
                524385,
                524321,
                589987,
                524289,
                524417,
                524353,
                590051,
                459012,
                524377,
                524313,
                589971,
                459028,
                524409,
                524345,
                590035,
                459020,
                524393,
                524329,
                590003,
                524297,
                524425,
                524361,
                590067,
                459010,
                524373,
                524309,
                524573,
                459026,
                524405,
                524341,
                590027,
                459018,
                524389,
                524325,
                589995,
                524293,
                524421,
                524357,
                590059,
                459014,
                524381,
                524317,
                589979,
                459030,
                524413,
                524349,
                590043,
                459022,
                524397,
                524333,
                590011,
                524301,
                524429,
                524365,
                590075,
                459009,
                524371,
                524307,
                524571,
                459025,
                524403,
                524339,
                590023,
                459017,
                524387,
                524323,
                589991,
                524291,
                524419,
                524355,
                590055,
                459013,
                524379,
                524315,
                589975,
                459029,
                524411,
                524347,
                590039,
                459021,
                524395,
                524331,
                590007,
                524299,
                524427,
                524363,
                590071,
                459011,
                524375,
                524311,
                524575,
                459027,
                524407,
                524343,
                590031,
                459019,
                524391,
                524327,
                589999,
                524295,
                524423,
                524359,
                590063,
                459015,
                524383,
                524319,
                589983,
                459031,
                524415,
                524351,
                590047,
                459023,
                524399,
                524335,
                590015,
                524303,
                524431,
                524367,
                590079
            ]),
            9
        ];
        var fixedDistCodeTab = [
            new Int32Array([
                327680,
                327696,
                327688,
                327704,
                327684,
                327700,
                327692,
                327708,
                327682,
                327698,
                327690,
                327706,
                327686,
                327702,
                327694,
                0,
                327681,
                327697,
                327689,
                327705,
                327685,
                327701,
                327693,
                327709,
                327683,
                327699,
                327691,
                327707,
                327687,
                327703,
                327695,
                0
            ]),
            5
        ];
        function FlateStream(str, maybeLength) {
            this.str = str;
            this.dict = str.dict;
            var cmf = str.getByte();
            var flg = str.getByte();
            if (cmf === -1 || flg === -1) {
                throw new a.FormatError(`Invalid header in flate stream: ${ cmf }, ${ flg }`);
            }
            if ((cmf & 15) !== 8) {
                throw new a.FormatError(`Unknown compression method in flate stream: ${ cmf }, ${ flg }`);
            }
            if (((cmf << 8) + flg) % 31 !== 0) {
                throw new a.FormatError(`Bad FCHECK in flate stream: ${ cmf }, ${ flg }`);
            }
            if (flg & 32) {
                throw new a.FormatError(`FDICT bit set in flate stream: ${ cmf }, ${ flg }`);
            }
            this.codeSize = 0;
            this.codeBuf = 0;
            DecodeStream.call(this, maybeLength);
        }
        FlateStream.prototype = Object.create(DecodeStream.prototype);
        FlateStream.prototype.getBits = function FlateStream_getBits(bits) {
            var str = this.str;
            var codeSize = this.codeSize;
            var codeBuf = this.codeBuf;
            var b;
            while (codeSize < bits) {
                if ((b = str.getByte()) === -1) {
                    throw new a.FormatError('Bad encoding in flate stream');
                }
                codeBuf |= b << codeSize;
                codeSize += 8;
            }
            b = codeBuf & (1 << bits) - 1;
            this.codeBuf = codeBuf >> bits;
            this.codeSize = codeSize -= bits;
            return b;
        };
        FlateStream.prototype.getCode = function FlateStream_getCode(table) {
            var str = this.str;
            var codes = table[0];
            var maxLen = table[1];
            var codeSize = this.codeSize;
            var codeBuf = this.codeBuf;
            var b;
            while (codeSize < maxLen) {
                if ((b = str.getByte()) === -1) {
                    break;
                }
                codeBuf |= b << codeSize;
                codeSize += 8;
            }
            var code = codes[codeBuf & (1 << maxLen) - 1];
            var codeLen = code >> 16;
            var codeVal = code & 65535;
            if (codeLen < 1 || codeSize < codeLen) {
                throw new a.FormatError('Bad encoding in flate stream');
            }
            this.codeBuf = codeBuf >> codeLen;
            this.codeSize = codeSize - codeLen;
            return codeVal;
        };
        FlateStream.prototype.generateHuffmanTable = function flateStreamGenerateHuffmanTable(lengths) {
            var n = lengths.length;
            var maxLen = 0;
            var i;
            for (i = 0; i < n; ++i) {
                if (lengths[i] > maxLen) {
                    maxLen = lengths[i];
                }
            }
            var size = 1 << maxLen;
            var codes = new Int32Array(size);
            for (var len = 1, code = 0, skip = 2; len <= maxLen; ++len, code <<= 1, skip <<= 1) {
                for (var val = 0; val < n; ++val) {
                    if (lengths[val] === len) {
                        var code2 = 0;
                        var t = code;
                        for (i = 0; i < len; ++i) {
                            code2 = code2 << 1 | t & 1;
                            t >>= 1;
                        }
                        for (i = code2; i < size; i += skip) {
                            codes[i] = len << 16 | val;
                        }
                        ++code;
                    }
                }
            }
            return [
                codes,
                maxLen
            ];
        };
        FlateStream.prototype.readBlock = function FlateStream_readBlock() {
            var buffer, len;
            var str = this.str;
            var hdr = this.getBits(3);
            if (hdr & 1) {
                this.eof = true;
            }
            hdr >>= 1;
            if (hdr === 0) {
                var b;
                if ((b = str.getByte()) === -1) {
                    throw new a.FormatError('Bad block header in flate stream');
                }
                var blockLen = b;
                if ((b = str.getByte()) === -1) {
                    throw new a.FormatError('Bad block header in flate stream');
                }
                blockLen |= b << 8;
                if ((b = str.getByte()) === -1) {
                    throw new a.FormatError('Bad block header in flate stream');
                }
                var check = b;
                if ((b = str.getByte()) === -1) {
                    throw new a.FormatError('Bad block header in flate stream');
                }
                check |= b << 8;
                if (check !== (~blockLen & 65535) && (blockLen !== 0 || check !== 0)) {
                    throw new a.FormatError('Bad uncompressed block length in flate stream');
                }
                this.codeBuf = 0;
                this.codeSize = 0;
                const bufferLength = this.bufferLength, end = bufferLength + blockLen;
                buffer = this.ensureBuffer(end);
                this.bufferLength = end;
                if (blockLen === 0) {
                    if (str.peekByte() === -1) {
                        this.eof = true;
                    }
                } else {
                    const block = str.getBytes(blockLen);
                    buffer.set(block, bufferLength);
                    if (block.length < blockLen) {
                        this.eof = true;
                    }
                }
                return;
            }
            var litCodeTable;
            var distCodeTable;
            if (hdr === 1) {
                litCodeTable = fixedLitCodeTab;
                distCodeTable = fixedDistCodeTab;
            } else if (hdr === 2) {
                var numLitCodes = this.getBits(5) + 257;
                var numDistCodes = this.getBits(5) + 1;
                var numCodeLenCodes = this.getBits(4) + 4;
                var codeLenCodeLengths = new Uint8Array(codeLenCodeMap.length);
                var i;
                for (i = 0; i < numCodeLenCodes; ++i) {
                    codeLenCodeLengths[codeLenCodeMap[i]] = this.getBits(3);
                }
                var codeLenCodeTab = this.generateHuffmanTable(codeLenCodeLengths);
                len = 0;
                i = 0;
                var codes = numLitCodes + numDistCodes;
                var codeLengths = new Uint8Array(codes);
                var bitsLength, bitsOffset, what;
                while (i < codes) {
                    var code = this.getCode(codeLenCodeTab);
                    if (code === 16) {
                        bitsLength = 2;
                        bitsOffset = 3;
                        what = len;
                    } else if (code === 17) {
                        bitsLength = 3;
                        bitsOffset = 3;
                        what = len = 0;
                    } else if (code === 18) {
                        bitsLength = 7;
                        bitsOffset = 11;
                        what = len = 0;
                    } else {
                        codeLengths[i++] = len = code;
                        continue;
                    }
                    var repeatLength = this.getBits(bitsLength) + bitsOffset;
                    while (repeatLength-- > 0) {
                        codeLengths[i++] = what;
                    }
                }
                litCodeTable = this.generateHuffmanTable(codeLengths.subarray(0, numLitCodes));
                distCodeTable = this.generateHuffmanTable(codeLengths.subarray(numLitCodes, codes));
            } else {
                throw new a.FormatError('Unknown block type in flate stream');
            }
            buffer = this.buffer;
            var limit = buffer ? buffer.length : 0;
            var pos = this.bufferLength;
            while (true) {
                var code1 = this.getCode(litCodeTable);
                if (code1 < 256) {
                    if (pos + 1 >= limit) {
                        buffer = this.ensureBuffer(pos + 1);
                        limit = buffer.length;
                    }
                    buffer[pos++] = code1;
                    continue;
                }
                if (code1 === 256) {
                    this.bufferLength = pos;
                    return;
                }
                code1 -= 257;
                code1 = lengthDecode[code1];
                var code2 = code1 >> 16;
                if (code2 > 0) {
                    code2 = this.getBits(code2);
                }
                len = (code1 & 65535) + code2;
                code1 = this.getCode(distCodeTable);
                code1 = distDecode[code1];
                code2 = code1 >> 16;
                if (code2 > 0) {
                    code2 = this.getBits(code2);
                }
                var dist = (code1 & 65535) + code2;
                if (pos + len >= limit) {
                    buffer = this.ensureBuffer(pos + len);
                    limit = buffer.length;
                }
                for (var k = 0; k < len; ++k, ++pos) {
                    buffer[pos] = buffer[pos - dist];
                }
            }
        };
        return FlateStream;
    }();
    var PredictorStream = function PredictorStreamClosure() {
        function PredictorStream(str, maybeLength, params) {
            if (!b.isDict(params)) {
                return str;
            }
            var predictor = this.predictor = params.get('Predictor') || 1;
            if (predictor <= 1) {
                return str;
            }
            if (predictor !== 2 && (predictor < 10 || predictor > 15)) {
                throw new a.FormatError(`Unsupported predictor: ${ predictor }`);
            }
            if (predictor === 2) {
                this.readBlock = this.readBlockTiff;
            } else {
                this.readBlock = this.readBlockPng;
            }
            this.str = str;
            this.dict = str.dict;
            var colors = this.colors = params.get('Colors') || 1;
            var bits = this.bits = params.get('BitsPerComponent') || 8;
            var columns = this.columns = params.get('Columns') || 1;
            this.pixBytes = colors * bits + 7 >> 3;
            this.rowBytes = columns * colors * bits + 7 >> 3;
            DecodeStream.call(this, maybeLength);
            return this;
        }
        PredictorStream.prototype = Object.create(DecodeStream.prototype);
        PredictorStream.prototype.readBlockTiff = function predictorStreamReadBlockTiff() {
            var rowBytes = this.rowBytes;
            var bufferLength = this.bufferLength;
            var buffer = this.ensureBuffer(bufferLength + rowBytes);
            var bits = this.bits;
            var colors = this.colors;
            var rawBytes = this.str.getBytes(rowBytes);
            this.eof = !rawBytes.length;
            if (this.eof) {
                return;
            }
            var inbuf = 0, outbuf = 0;
            var inbits = 0, outbits = 0;
            var pos = bufferLength;
            var i;
            if (bits === 1 && colors === 1) {
                for (i = 0; i < rowBytes; ++i) {
                    var c = rawBytes[i] ^ inbuf;
                    c ^= c >> 1;
                    c ^= c >> 2;
                    c ^= c >> 4;
                    inbuf = (c & 1) << 7;
                    buffer[pos++] = c;
                }
            } else if (bits === 8) {
                for (i = 0; i < colors; ++i) {
                    buffer[pos++] = rawBytes[i];
                }
                for (; i < rowBytes; ++i) {
                    buffer[pos] = buffer[pos - colors] + rawBytes[i];
                    pos++;
                }
            } else if (bits === 16) {
                var bytesPerPixel = colors * 2;
                for (i = 0; i < bytesPerPixel; ++i) {
                    buffer[pos++] = rawBytes[i];
                }
                for (; i < rowBytes; i += 2) {
                    var sum = ((rawBytes[i] & 255) << 8) + (rawBytes[i + 1] & 255) + ((buffer[pos - bytesPerPixel] & 255) << 8) + (buffer[pos - bytesPerPixel + 1] & 255);
                    buffer[pos++] = sum >> 8 & 255;
                    buffer[pos++] = sum & 255;
                }
            } else {
                var compArray = new Uint8Array(colors + 1);
                var bitMask = (1 << bits) - 1;
                var j = 0, k = bufferLength;
                var columns = this.columns;
                for (i = 0; i < columns; ++i) {
                    for (var kk = 0; kk < colors; ++kk) {
                        if (inbits < bits) {
                            inbuf = inbuf << 8 | rawBytes[j++] & 255;
                            inbits += 8;
                        }
                        compArray[kk] = compArray[kk] + (inbuf >> inbits - bits) & bitMask;
                        inbits -= bits;
                        outbuf = outbuf << bits | compArray[kk];
                        outbits += bits;
                        if (outbits >= 8) {
                            buffer[k++] = outbuf >> outbits - 8 & 255;
                            outbits -= 8;
                        }
                    }
                }
                if (outbits > 0) {
                    buffer[k++] = (outbuf << 8 - outbits) + (inbuf & (1 << 8 - outbits) - 1);
                }
            }
            this.bufferLength += rowBytes;
        };
        PredictorStream.prototype.readBlockPng = function predictorStreamReadBlockPng() {
            var rowBytes = this.rowBytes;
            var pixBytes = this.pixBytes;
            var predictor = this.str.getByte();
            var rawBytes = this.str.getBytes(rowBytes);
            this.eof = !rawBytes.length;
            if (this.eof) {
                return;
            }
            var bufferLength = this.bufferLength;
            var buffer = this.ensureBuffer(bufferLength + rowBytes);
            var prevRow = buffer.subarray(bufferLength - rowBytes, bufferLength);
            if (prevRow.length === 0) {
                prevRow = new Uint8Array(rowBytes);
            }
            var i, j = bufferLength, up, c;
            switch (predictor) {
            case 0:
                for (i = 0; i < rowBytes; ++i) {
                    buffer[j++] = rawBytes[i];
                }
                break;
            case 1:
                for (i = 0; i < pixBytes; ++i) {
                    buffer[j++] = rawBytes[i];
                }
                for (; i < rowBytes; ++i) {
                    buffer[j] = buffer[j - pixBytes] + rawBytes[i] & 255;
                    j++;
                }
                break;
            case 2:
                for (i = 0; i < rowBytes; ++i) {
                    buffer[j++] = prevRow[i] + rawBytes[i] & 255;
                }
                break;
            case 3:
                for (i = 0; i < pixBytes; ++i) {
                    buffer[j++] = (prevRow[i] >> 1) + rawBytes[i];
                }
                for (; i < rowBytes; ++i) {
                    buffer[j] = (prevRow[i] + buffer[j - pixBytes] >> 1) + rawBytes[i] & 255;
                    j++;
                }
                break;
            case 4:
                for (i = 0; i < pixBytes; ++i) {
                    up = prevRow[i];
                    c = rawBytes[i];
                    buffer[j++] = up + c;
                }
                for (; i < rowBytes; ++i) {
                    up = prevRow[i];
                    var upLeft = prevRow[i - pixBytes];
                    var left = buffer[j - pixBytes];
                    var p = left + up - upLeft;
                    var pa = p - left;
                    if (pa < 0) {
                        pa = -pa;
                    }
                    var pb = p - up;
                    if (pb < 0) {
                        pb = -pb;
                    }
                    var pc = p - upLeft;
                    if (pc < 0) {
                        pc = -pc;
                    }
                    c = rawBytes[i];
                    if (pa <= pb && pa <= pc) {
                        buffer[j++] = left + c;
                    } else if (pb <= pc) {
                        buffer[j++] = up + c;
                    } else {
                        buffer[j++] = upLeft + c;
                    }
                }
                break;
            default:
                throw new a.FormatError(`Unsupported predictor: ${ predictor }`);
            }
            this.bufferLength += rowBytes;
        };
        return PredictorStream;
    }();
    var DecryptStream = function DecryptStreamClosure() {
        function DecryptStream(str, maybeLength, decrypt) {
            this.str = str;
            this.dict = str.dict;
            this.decrypt = decrypt;
            this.nextChunk = null;
            this.initialized = false;
            DecodeStream.call(this, maybeLength);
        }
        var chunkSize = 512;
        DecryptStream.prototype = Object.create(DecodeStream.prototype);
        DecryptStream.prototype.readBlock = function DecryptStream_readBlock() {
            var chunk;
            if (this.initialized) {
                chunk = this.nextChunk;
            } else {
                chunk = this.str.getBytes(chunkSize);
                this.initialized = true;
            }
            if (!chunk || chunk.length === 0) {
                this.eof = true;
                return;
            }
            this.nextChunk = this.str.getBytes(chunkSize);
            var hasMoreData = this.nextChunk && this.nextChunk.length > 0;
            var decrypt = this.decrypt;
            chunk = decrypt(chunk, !hasMoreData);
            var bufferLength = this.bufferLength;
            var i, n = chunk.length;
            var buffer = this.ensureBuffer(bufferLength + n);
            for (i = 0; i < n; i++) {
                buffer[bufferLength++] = chunk[i];
            }
            this.bufferLength = bufferLength;
        };
        return DecryptStream;
    }();
    var Ascii85Stream = function Ascii85StreamClosure() {
        function Ascii85Stream(str, maybeLength) {
            this.str = str;
            this.dict = str.dict;
            this.input = new Uint8Array(5);
            if (maybeLength) {
                maybeLength = 0.8 * maybeLength;
            }
            DecodeStream.call(this, maybeLength);
        }
        Ascii85Stream.prototype = Object.create(DecodeStream.prototype);
        Ascii85Stream.prototype.readBlock = function Ascii85Stream_readBlock() {
            var TILDA_CHAR = 126;
            var Z_LOWER_CHAR = 122;
            var EOF = -1;
            var str = this.str;
            var c = str.getByte();
            while (c.isWhiteSpace(c)) {
                c = str.getByte();
            }
            if (c === EOF || c === TILDA_CHAR) {
                this.eof = true;
                return;
            }
            var bufferLength = this.bufferLength, buffer;
            var i;
            if (c === Z_LOWER_CHAR) {
                buffer = this.ensureBuffer(bufferLength + 4);
                for (i = 0; i < 4; ++i) {
                    buffer[bufferLength + i] = 0;
                }
                this.bufferLength += 4;
            } else {
                var input = this.input;
                input[0] = c;
                for (i = 1; i < 5; ++i) {
                    c = str.getByte();
                    while (c.isWhiteSpace(c)) {
                        c = str.getByte();
                    }
                    input[i] = c;
                    if (c === EOF || c === TILDA_CHAR) {
                        break;
                    }
                }
                buffer = this.ensureBuffer(bufferLength + i - 1);
                this.bufferLength += i - 1;
                if (i < 5) {
                    for (; i < 5; ++i) {
                        input[i] = 33 + 84;
                    }
                    this.eof = true;
                }
                var t = 0;
                for (i = 0; i < 5; ++i) {
                    t = t * 85 + (input[i] - 33);
                }
                for (i = 3; i >= 0; --i) {
                    buffer[bufferLength + i] = t & 255;
                    t >>= 8;
                }
            }
        };
        return Ascii85Stream;
    }();
    var AsciiHexStream = function AsciiHexStreamClosure() {
        function AsciiHexStream(str, maybeLength) {
            this.str = str;
            this.dict = str.dict;
            this.firstDigit = -1;
            if (maybeLength) {
                maybeLength = 0.5 * maybeLength;
            }
            DecodeStream.call(this, maybeLength);
        }
        AsciiHexStream.prototype = Object.create(DecodeStream.prototype);
        AsciiHexStream.prototype.readBlock = function AsciiHexStream_readBlock() {
            var UPSTREAM_BLOCK_SIZE = 8000;
            var bytes = this.str.getBytes(UPSTREAM_BLOCK_SIZE);
            if (!bytes.length) {
                this.eof = true;
                return;
            }
            var maxDecodeLength = bytes.length + 1 >> 1;
            var buffer = this.ensureBuffer(this.bufferLength + maxDecodeLength);
            var bufferLength = this.bufferLength;
            var firstDigit = this.firstDigit;
            for (var i = 0, ii = bytes.length; i < ii; i++) {
                var ch = bytes[i], digit;
                if (ch >= 48 && ch <= 57) {
                    digit = ch & 15;
                } else if (ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102) {
                    digit = (ch & 15) + 9;
                } else if (ch === 62) {
                    this.eof = true;
                    break;
                } else {
                    continue;
                }
                if (firstDigit < 0) {
                    firstDigit = digit;
                } else {
                    buffer[bufferLength++] = firstDigit << 4 | digit;
                    firstDigit = -1;
                }
            }
            if (firstDigit >= 0 && this.eof) {
                buffer[bufferLength++] = firstDigit << 4;
                firstDigit = -1;
            }
            this.firstDigit = firstDigit;
            this.bufferLength = bufferLength;
        };
        return AsciiHexStream;
    }();
    var RunLengthStream = function RunLengthStreamClosure() {
        function RunLengthStream(str, maybeLength) {
            this.str = str;
            this.dict = str.dict;
            DecodeStream.call(this, maybeLength);
        }
        RunLengthStream.prototype = Object.create(DecodeStream.prototype);
        RunLengthStream.prototype.readBlock = function RunLengthStream_readBlock() {
            var repeatHeader = this.str.getBytes(2);
            if (!repeatHeader || repeatHeader.length < 2 || repeatHeader[0] === 128) {
                this.eof = true;
                return;
            }
            var buffer;
            var bufferLength = this.bufferLength;
            var n = repeatHeader[0];
            if (n < 128) {
                buffer = this.ensureBuffer(bufferLength + n + 1);
                buffer[bufferLength++] = repeatHeader[1];
                if (n > 0) {
                    var source = this.str.getBytes(n);
                    buffer.set(source, bufferLength);
                    bufferLength += n;
                }
            } else {
                n = 257 - n;
                var b = repeatHeader[1];
                buffer = this.ensureBuffer(bufferLength + n + 1);
                for (var i = 0; i < n; i++) {
                    buffer[bufferLength++] = b;
                }
            }
            this.bufferLength = bufferLength;
        };
        return RunLengthStream;
    }();
    var LZWStream = function LZWStreamClosure() {
        function LZWStream(str, maybeLength, earlyChange) {
            this.str = str;
            this.dict = str.dict;
            this.cachedData = 0;
            this.bitsCached = 0;
            var maxLzwDictionarySize = 4096;
            var lzwState = {
                earlyChange,
                codeLength: 9,
                nextCode: 258,
                dictionaryValues: new Uint8Array(maxLzwDictionarySize),
                dictionaryLengths: new Uint16Array(maxLzwDictionarySize),
                dictionaryPrevCodes: new Uint16Array(maxLzwDictionarySize),
                currentSequence: new Uint8Array(maxLzwDictionarySize),
                currentSequenceLength: 0
            };
            for (var i = 0; i < 256; ++i) {
                lzwState.dictionaryValues[i] = i;
                lzwState.dictionaryLengths[i] = 1;
            }
            this.lzwState = lzwState;
            DecodeStream.call(this, maybeLength);
        }
        LZWStream.prototype = Object.create(DecodeStream.prototype);
        LZWStream.prototype.readBits = function LZWStream_readBits(n) {
            var bitsCached = this.bitsCached;
            var cachedData = this.cachedData;
            while (bitsCached < n) {
                var c = this.str.getByte();
                if (c === -1) {
                    this.eof = true;
                    return null;
                }
                cachedData = cachedData << 8 | c;
                bitsCached += 8;
            }
            this.bitsCached = bitsCached -= n;
            this.cachedData = cachedData;
            this.lastCode = null;
            return cachedData >>> bitsCached & (1 << n) - 1;
        };
        LZWStream.prototype.readBlock = function LZWStream_readBlock() {
            var blockSize = 512;
            var estimatedDecodedSize = blockSize * 2, decodedSizeDelta = blockSize;
            var i, j, q;
            var lzwState = this.lzwState;
            if (!lzwState) {
                return;
            }
            var earlyChange = lzwState.earlyChange;
            var nextCode = lzwState.nextCode;
            var dictionaryValues = lzwState.dictionaryValues;
            var dictionaryLengths = lzwState.dictionaryLengths;
            var dictionaryPrevCodes = lzwState.dictionaryPrevCodes;
            var codeLength = lzwState.codeLength;
            var prevCode = lzwState.prevCode;
            var currentSequence = lzwState.currentSequence;
            var currentSequenceLength = lzwState.currentSequenceLength;
            var decodedLength = 0;
            var currentBufferLength = this.bufferLength;
            var buffer = this.ensureBuffer(this.bufferLength + estimatedDecodedSize);
            for (i = 0; i < blockSize; i++) {
                var code = this.readBits(codeLength);
                var hasPrev = currentSequenceLength > 0;
                if (code < 256) {
                    currentSequence[0] = code;
                    currentSequenceLength = 1;
                } else if (code >= 258) {
                    if (code < nextCode) {
                        currentSequenceLength = dictionaryLengths[code];
                        for (j = currentSequenceLength - 1, q = code; j >= 0; j--) {
                            currentSequence[j] = dictionaryValues[q];
                            q = dictionaryPrevCodes[q];
                        }
                    } else {
                        currentSequence[currentSequenceLength++] = currentSequence[0];
                    }
                } else if (code === 256) {
                    codeLength = 9;
                    nextCode = 258;
                    currentSequenceLength = 0;
                    continue;
                } else {
                    this.eof = true;
                    delete this.lzwState;
                    break;
                }
                if (hasPrev) {
                    dictionaryPrevCodes[nextCode] = prevCode;
                    dictionaryLengths[nextCode] = dictionaryLengths[prevCode] + 1;
                    dictionaryValues[nextCode] = currentSequence[0];
                    nextCode++;
                    codeLength = nextCode + earlyChange & nextCode + earlyChange - 1 ? codeLength : Math.min(Math.log(nextCode + earlyChange) / 0.6931471805599453 + 1, 12) | 0;
                }
                prevCode = code;
                decodedLength += currentSequenceLength;
                if (estimatedDecodedSize < decodedLength) {
                    do {
                        estimatedDecodedSize += decodedSizeDelta;
                    } while (estimatedDecodedSize < decodedLength);
                    buffer = this.ensureBuffer(this.bufferLength + estimatedDecodedSize);
                }
                for (j = 0; j < currentSequenceLength; j++) {
                    buffer[currentBufferLength++] = currentSequence[j];
                }
            }
            lzwState.nextCode = nextCode;
            lzwState.codeLength = codeLength;
            lzwState.prevCode = prevCode;
            lzwState.currentSequenceLength = currentSequenceLength;
            this.bufferLength = currentBufferLength;
        };
        return LZWStream;
    }();
    var NullStream = function NullStreamClosure() {
        function NullStream() {
            Stream.call(this, new Uint8Array(0));
        }
        NullStream.prototype = Stream.prototype;
        return NullStream;
    }();
    return {
        Ascii85Stream,
        AsciiHexStream,
        DecodeStream,
        DecryptStream,
        FlateStream,
        LZWStream,
        NullStream,
        PredictorStream,
        RunLengthStream,
        Stream,
        StreamsSequenceStream,
        StringStream
    };
});