define([
    '../shared/util.js',
    './display_utils.js',
    '../shared/is_node.js'
], function (a, b, c) {
    'use strict';
    let SVGGraphics = function () {
        throw new Error('Not implemented: SVGGraphics');
    };
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
        const SVG_DEFAULTS = {
            fontStyle: 'normal',
            fontWeight: 'normal',
            fillColor: '#000000'
        };
        const XML_NS = 'http://www.w3.org/XML/1998/namespace';
        const XLINK_NS = 'http://www.w3.org/1999/xlink';
        const LINE_CAP_STYLES = [
            'butt',
            'round',
            'square'
        ];
        const LINE_JOIN_STYLES = [
            'miter',
            'round',
            'bevel'
        ];
        const convertImgDataToPng = function () {
            const PNG_HEADER = new Uint8Array([
                137,
                80,
                78,
                71,
                13,
                10,
                26,
                10
            ]);
            const CHUNK_WRAPPER_SIZE = 12;
            const crcTable = new Int32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let h = 0; h < 8; h++) {
                    if (c & 1) {
                        c = 3988292384 ^ c >> 1 & 2147483647;
                    } else {
                        c = c >> 1 & 2147483647;
                    }
                }
                crcTable[i] = c;
            }
            function crc32(data, start, end) {
                let crc = -1;
                for (let i = start; i < end; i++) {
                    const a = (crc ^ data[i]) & 255;
                    const b = crcTable[a];
                    crc = crc >>> 8 ^ b;
                }
                return crc ^ -1;
            }
            function writePngChunk(type, body, data, offset) {
                let p = offset;
                const len = body.length;
                data[p] = len >> 24 & 255;
                data[p + 1] = len >> 16 & 255;
                data[p + 2] = len >> 8 & 255;
                data[p + 3] = len & 255;
                p += 4;
                data[p] = type.charCodeAt(0) & 255;
                data[p + 1] = type.charCodeAt(1) & 255;
                data[p + 2] = type.charCodeAt(2) & 255;
                data[p + 3] = type.charCodeAt(3) & 255;
                p += 4;
                data.set(body, p);
                p += body.length;
                const crc = crc32(data, offset + 4, p);
                data[p] = crc >> 24 & 255;
                data[p + 1] = crc >> 16 & 255;
                data[p + 2] = crc >> 8 & 255;
                data[p + 3] = crc & 255;
            }
            function adler32(data, start, end) {
                let a = 1;
                let b = 0;
                for (let i = start; i < end; ++i) {
                    a = (a + (data[i] & 255)) % 65521;
                    b = (b + a) % 65521;
                }
                return b << 16 | a;
            }
            function deflateSync(literals) {
                if (!c.isNodeJS) {
                    return deflateSyncUncompressed(literals);
                }
                try {
                    let input;
                    if (parseInt(process.versions.node) >= 8) {
                        input = literals;
                    } else {
                        input = Buffer.from(literals);
                    }
                    const output = __non_webpack_require__('zlib').deflateSync(input, { level: 9 });
                    return output instanceof Uint8Array ? output : new Uint8Array(output);
                } catch (e) {
                    a.warn('Not compressing PNG because zlib.deflateSync is unavailable: ' + e);
                }
                return deflateSyncUncompressed(literals);
            }
            function deflateSyncUncompressed(literals) {
                let len = literals.length;
                const maxBlockLength = 65535;
                const deflateBlocks = Math.ceil(len / maxBlockLength);
                const idat = new Uint8Array(2 + len + deflateBlocks * 5 + 4);
                let pi = 0;
                idat[pi++] = 120;
                idat[pi++] = 156;
                let pos = 0;
                while (len > maxBlockLength) {
                    idat[pi++] = 0;
                    idat[pi++] = 255;
                    idat[pi++] = 255;
                    idat[pi++] = 0;
                    idat[pi++] = 0;
                    idat.set(literals.subarray(pos, pos + maxBlockLength), pi);
                    pi += maxBlockLength;
                    pos += maxBlockLength;
                    len -= maxBlockLength;
                }
                idat[pi++] = 1;
                idat[pi++] = len & 255;
                idat[pi++] = len >> 8 & 255;
                idat[pi++] = ~len & 65535 & 255;
                idat[pi++] = (~len & 65535) >> 8 & 255;
                idat.set(literals.subarray(pos), pi);
                pi += literals.length - pos;
                const adler = adler32(literals, 0, literals.length);
                idat[pi++] = adler >> 24 & 255;
                idat[pi++] = adler >> 16 & 255;
                idat[pi++] = adler >> 8 & 255;
                idat[pi++] = adler & 255;
                return idat;
            }
            function encode(imgData, kind, forceDataSchema, isMask) {
                const width = imgData.width;
                const height = imgData.height;
                let bitDepth, colorType, lineSize;
                const bytes = imgData.data;
                switch (kind) {
                case a.ImageKind.GRAYSCALE_1BPP:
                    colorType = 0;
                    bitDepth = 1;
                    lineSize = width + 7 >> 3;
                    break;
                case a.ImageKind.RGB_24BPP:
                    colorType = 2;
                    bitDepth = 8;
                    lineSize = width * 3;
                    break;
                case a.ImageKind.RGBA_32BPP:
                    colorType = 6;
                    bitDepth = 8;
                    lineSize = width * 4;
                    break;
                default:
                    throw new Error('invalid format');
                }
                const literals = new Uint8Array((1 + lineSize) * height);
                let offsetLiterals = 0, offsetBytes = 0;
                for (let y = 0; y < height; ++y) {
                    literals[offsetLiterals++] = 0;
                    literals.set(bytes.subarray(offsetBytes, offsetBytes + lineSize), offsetLiterals);
                    offsetBytes += lineSize;
                    offsetLiterals += lineSize;
                }
                if (kind === a.ImageKind.GRAYSCALE_1BPP && isMask) {
                    offsetLiterals = 0;
                    for (let y = 0; y < height; y++) {
                        offsetLiterals++;
                        for (let i = 0; i < lineSize; i++) {
                            literals[offsetLiterals++] ^= 255;
                        }
                    }
                }
                const ihdr = new Uint8Array([
                    width >> 24 & 255,
                    width >> 16 & 255,
                    width >> 8 & 255,
                    width & 255,
                    height >> 24 & 255,
                    height >> 16 & 255,
                    height >> 8 & 255,
                    height & 255,
                    bitDepth,
                    colorType,
                    0,
                    0,
                    0
                ]);
                const idat = deflateSync(literals);
                const pngLength = PNG_HEADER.length + CHUNK_WRAPPER_SIZE * 3 + ihdr.length + idat.length;
                const data = new Uint8Array(pngLength);
                let offset = 0;
                data.set(PNG_HEADER, offset);
                offset += PNG_HEADER.length;
                writePngChunk('IHDR', ihdr, data, offset);
                offset += CHUNK_WRAPPER_SIZE + ihdr.length;
                writePngChunk('IDATA', idat, data, offset);
                offset += CHUNK_WRAPPER_SIZE + idat.length;
                writePngChunk('IEND', new Uint8Array(0), data, offset);
                return a.createObjectURL(data, 'image/png', forceDataSchema);
            }
            return function convertImgDataToPng(imgData, forceDataSchema, isMask) {
                const kind = imgData.kind === undefined ? a.ImageKind.GRAYSCALE_1BPP : imgData.kind;
                return encode(imgData, kind, forceDataSchema, isMask);
            };
        }();
        class SVGExtraState {
            constructor() {
                this.fontSizeScale = 1;
                this.fontWeight = SVG_DEFAULTS.fontWeight;
                this.fontSize = 0;
                this.textMatrix = a.IDENTITY_MATRIX;
                this.fontMatrix = a.FONT_IDENTITY_MATRIX;
                this.leading = 0;
                this.textRenderingMode = a.TextRenderingMode.FILL;
                this.textMatrixScale = 1;
                this.x = 0;
                this.y = 0;
                this.lineX = 0;
                this.lineY = 0;
                this.charSpacing = 0;
                this.wordSpacing = 0;
                this.textHScale = 1;
                this.textRise = 0;
                this.fillColor = SVG_DEFAULTS.fillColor;
                this.strokeColor = '#000000';
                this.fillAlpha = 1;
                this.strokeAlpha = 1;
                this.lineWidth = 1;
                this.lineJoin = '';
                this.lineCap = '';
                this.miterLimit = 0;
                this.dashArray = [];
                this.dashPhase = 0;
                this.dependencies = [];
                this.activeClipUrl = null;
                this.clipGroup = null;
                this.maskId = '';
            }
            clone() {
                return Object.create(this);
            }
            setCurrentPoint(x, y) {
                this.x = x;
                this.y = y;
            }
        }
        function opListToTree(opList) {
            let opTree = [];
            const tmp = [];
            for (const opListElement of opList) {
                if (opListElement.fn === 'save') {
                    opTree.push({
                        fnId: 92,
                        fn: 'group',
                        items: []
                    });
                    tmp.push(opTree);
                    opTree = opTree[opTree.length - 1].items;
                    continue;
                }
                if (opListElement.fn === 'restore') {
                    opTree = tmp.pop();
                } else {
                    opTree.push(opListElement);
                }
            }
            return opTree;
        }
        function pf(value) {
            if (Number.isInteger(value)) {
                return value.toString();
            }
            const s = value.toFixed(10);
            let i = s.length - 1;
            if (s[i] !== '0') {
                return s;
            }
            do {
                i--;
            } while (s[i] === '0');
            return s.substring(0, s[i] === '.' ? i : i + 1);
        }
        function pm(m) {
            if (m[4] === 0 && m[5] === 0) {
                if (m[1] === 0 && m[2] === 0) {
                    if (m[0] === 1 && m[3] === 1) {
                        return '';
                    }
                    return `scale(${ pf(m[0]) } ${ pf(m[3]) })`;
                }
                if (m[0] === m[3] && m[1] === -m[2]) {
                    const a = Math.acos(m[0]) * 180 / Math.PI;
                    return `rotate(${ pf(a) })`;
                }
            } else {
                if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) {
                    return `translate(${ pf(m[4]) } ${ pf(m[5]) })`;
                }
            }
            return `matrix(${ pf(m[0]) } ${ pf(m[1]) } ${ pf(m[2]) } ${ pf(m[3]) } ${ pf(m[4]) } ` + `${ pf(m[5]) })`;
        }
        let clipCount = 0;
        let maskCount = 0;
        let shadingCount = 0;
        SVGGraphics = class SVGGraphics {
            constructor(commonObjs, objs, forceDataSchema = false) {
                this.svgFactory = new b.DOMSVGFactory();
                this.current = new SVGExtraState();
                this.transformMatrix = a.IDENTITY_MATRIX;
                this.transformStack = [];
                this.extraStack = [];
                this.commonObjs = commonObjs;
                this.objs = objs;
                this.pendingClip = null;
                this.pendingEOFill = false;
                this.embedFonts = false;
                this.embeddedFonts = Object.create(null);
                this.cssStyle = null;
                this.forceDataSchema = !!forceDataSchema;
                this._operatorIdMapping = [];
                for (const op in a.OPS) {
                    this._operatorIdMapping[a.OPS[op]] = op;
                }
            }
            save() {
                this.transformStack.push(this.transformMatrix);
                const old = this.current;
                this.extraStack.push(old);
                this.current = old.clone();
            }
            restore() {
                this.transformMatrix = this.transformStack.pop();
                this.current = this.extraStack.pop();
                this.pendingClip = null;
                this.tgrp = null;
            }
            group(items) {
                this.save();
                this.executeOpTree(items);
                this.restore();
            }
            loadDependencies(operatorList) {
                const fnArray = operatorList.fnArray;
                const argsArray = operatorList.argsArray;
                for (let i = 0, ii = fnArray.length; i < ii; i++) {
                    if (fnArray[i] !== a.OPS.dependency) {
                        continue;
                    }
                    for (const obj of argsArray[i]) {
                        const objsPool = obj.startsWith('g_') ? this.commonObjs : this.objs;
                        const promise = new Promise(resolve => {
                            objsPool.get(obj, resolve);
                        });
                        this.current.dependencies.push(promise);
                    }
                }
                return Promise.all(this.current.dependencies);
            }
            transform(a, b, c, d, e, f) {
                const transformMatrix = [
                    a,
                    b,
                    c,
                    d,
                    e,
                    f
                ];
                this.transformMatrix = a.Util.transform(this.transformMatrix, transformMatrix);
                this.tgrp = null;
            }
            getSVG(operatorList, viewport) {
                this.viewport = viewport;
                const svgElement = this._initialize(viewport);
                return this.loadDependencies(operatorList).then(() => {
                    this.transformMatrix = a.IDENTITY_MATRIX;
                    this.executeOpTree(this.convertOpList(operatorList));
                    return svgElement;
                });
            }
            convertOpList(operatorList) {
                const operatorIdMapping = this._operatorIdMapping;
                const argsArray = operatorList.argsArray;
                const fnArray = operatorList.fnArray;
                const opList = [];
                for (let i = 0, ii = fnArray.length; i < ii; i++) {
                    const fnId = fnArray[i];
                    opList.push({
                        fnId,
                        fn: operatorIdMapping[fnId],
                        args: argsArray[i]
                    });
                }
                return opListToTree(opList);
            }
            executeOpTree(opTree) {
                for (const opTreeElement of opTree) {
                    const fn = opTreeElement.fn;
                    const fnId = opTreeElement.fnId;
                    const args = opTreeElement.args;
                    switch (fnId | 0) {
                    case a.OPS.beginText:
                        this.beginText();
                        break;
                    case a.OPS.dependency:
                        break;
                    case a.OPS.setLeading:
                        this.setLeading(args);
                        break;
                    case a.OPS.setLeadingMoveText:
                        this.setLeadingMoveText(args[0], args[1]);
                        break;
                    case a.OPS.setFont:
                        this.setFont(args);
                        break;
                    case a.OPS.showText:
                        this.showText(args[0]);
                        break;
                    case a.OPS.showSpacedText:
                        this.showText(args[0]);
                        break;
                    case a.OPS.endText:
                        this.endText();
                        break;
                    case a.OPS.moveText:
                        this.moveText(args[0], args[1]);
                        break;
                    case a.OPS.setCharSpacing:
                        this.setCharSpacing(args[0]);
                        break;
                    case a.OPS.setWordSpacing:
                        this.setWordSpacing(args[0]);
                        break;
                    case a.OPS.setHScale:
                        this.setHScale(args[0]);
                        break;
                    case a.OPS.setTextMatrix:
                        this.setTextMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
                        break;
                    case a.OPS.setTextRise:
                        this.setTextRise(args[0]);
                        break;
                    case a.OPS.setTextRenderingMode:
                        this.setTextRenderingMode(args[0]);
                        break;
                    case a.OPS.setLineWidth:
                        this.setLineWidth(args[0]);
                        break;
                    case a.OPS.setLineJoin:
                        this.setLineJoin(args[0]);
                        break;
                    case a.OPS.setLineCap:
                        this.setLineCap(args[0]);
                        break;
                    case a.OPS.setMiterLimit:
                        this.setMiterLimit(args[0]);
                        break;
                    case a.OPS.setFillRGBColor:
                        this.setFillRGBColor(args[0], args[1], args[2]);
                        break;
                    case a.OPS.setStrokeRGBColor:
                        this.setStrokeRGBColor(args[0], args[1], args[2]);
                        break;
                    case a.OPS.setStrokeColorN:
                        this.setStrokeColorN(args);
                        break;
                    case a.OPS.setFillColorN:
                        this.setFillColorN(args);
                        break;
                    case a.OPS.shadingFill:
                        this.shadingFill(args[0]);
                        break;
                    case a.OPS.setDash:
                        this.setDash(args[0], args[1]);
                        break;
                    case a.OPS.setRenderingIntent:
                        this.setRenderingIntent(args[0]);
                        break;
                    case a.OPS.setFlatness:
                        this.setFlatness(args[0]);
                        break;
                    case a.OPS.setGState:
                        this.setGState(args[0]);
                        break;
                    case a.OPS.fill:
                        this.fill();
                        break;
                    case a.OPS.eoFill:
                        this.eoFill();
                        break;
                    case a.OPS.stroke:
                        this.stroke();
                        break;
                    case a.OPS.fillStroke:
                        this.fillStroke();
                        break;
                    case a.OPS.eoFillStroke:
                        this.eoFillStroke();
                        break;
                    case a.OPS.clip:
                        this.clip('nonzero');
                        break;
                    case a.OPS.eoClip:
                        this.clip('evenodd');
                        break;
                    case a.OPS.paintSolidColorImageMask:
                        this.paintSolidColorImageMask();
                        break;
                    case a.OPS.paintImageXObject:
                        this.paintImageXObject(args[0]);
                        break;
                    case a.OPS.paintInlineImageXObject:
                        this.paintInlineImageXObject(args[0]);
                        break;
                    case a.OPS.paintImageMaskXObject:
                        this.paintImageMaskXObject(args[0]);
                        break;
                    case a.OPS.paintFormXObjectBegin:
                        this.paintFormXObjectBegin(args[0], args[1]);
                        break;
                    case a.OPS.paintFormXObjectEnd:
                        this.paintFormXObjectEnd();
                        break;
                    case a.OPS.closePath:
                        this.closePath();
                        break;
                    case a.OPS.closeStroke:
                        this.closeStroke();
                        break;
                    case a.OPS.closeFillStroke:
                        this.closeFillStroke();
                        break;
                    case a.OPS.closeEOFillStroke:
                        this.closeEOFillStroke();
                        break;
                    case a.OPS.nextLine:
                        this.nextLine();
                        break;
                    case a.OPS.transform:
                        this.transform(args[0], args[1], args[2], args[3], args[4], args[5]);
                        break;
                    case a.OPS.constructPath:
                        this.constructPath(args[0], args[1]);
                        break;
                    case a.OPS.endPath:
                        this.endPath();
                        break;
                    case 92:
                        this.group(opTreeElement.items);
                        break;
                    default:
                        a.warn(`Unimplemented operator ${ fn }`);
                        break;
                    }
                }
            }
            setWordSpacing(wordSpacing) {
                this.current.wordSpacing = wordSpacing;
            }
            setCharSpacing(charSpacing) {
                this.current.charSpacing = charSpacing;
            }
            nextLine() {
                this.moveText(0, this.current.leading);
            }
            setTextMatrix(a, b, c, d, e, f) {
                const current = this.current;
                current.textMatrix = current.lineMatrix = [
                    a,
                    b,
                    c,
                    d,
                    e,
                    f
                ];
                current.textMatrixScale = Math.sqrt(a * a + b * b);
                current.x = current.lineX = 0;
                current.y = current.lineY = 0;
                current.xcoords = [];
                current.ycoords = [];
                current.tspan = this.svgFactory.createElement('svg:tspan');
                current.tspan.setAttributeNS(null, 'font-family', current.fontFamily);
                current.tspan.setAttributeNS(null, 'font-size', `${ pf(current.fontSize) }px`);
                current.tspan.setAttributeNS(null, 'y', pf(-current.y));
                current.txtElement = this.svgFactory.createElement('svg:text');
                current.txtElement.appendChild(current.tspan);
            }
            beginText() {
                const current = this.current;
                current.x = current.lineX = 0;
                current.y = current.lineY = 0;
                current.textMatrix = a.IDENTITY_MATRIX;
                current.lineMatrix = a.IDENTITY_MATRIX;
                current.textMatrixScale = 1;
                current.tspan = this.svgFactory.createElement('svg:tspan');
                current.txtElement = this.svgFactory.createElement('svg:text');
                current.txtgrp = this.svgFactory.createElement('svg:g');
                current.xcoords = [];
                current.ycoords = [];
            }
            moveText(x, y) {
                const current = this.current;
                current.x = current.lineX += x;
                current.y = current.lineY += y;
                current.xcoords = [];
                current.ycoords = [];
                current.tspan = this.svgFactory.createElement('svg:tspan');
                current.tspan.setAttributeNS(null, 'font-family', current.fontFamily);
                current.tspan.setAttributeNS(null, 'font-size', `${ pf(current.fontSize) }px`);
                current.tspan.setAttributeNS(null, 'y', pf(-current.y));
            }
            showText(glyphs) {
                const current = this.current;
                const font = current.font;
                const fontSize = current.fontSize;
                if (fontSize === 0) {
                    return;
                }
                const fontSizeScale = current.fontSizeScale;
                const charSpacing = current.charSpacing;
                const wordSpacing = current.wordSpacing;
                const fontDirection = current.fontDirection;
                const textHScale = current.textHScale * fontDirection;
                const vertical = font.vertical;
                const spacingDir = vertical ? 1 : -1;
                const defaultVMetrics = font.defaultVMetrics;
                const widthAdvanceScale = fontSize * current.fontMatrix[0];
                let x = 0;
                for (const glyph of glyphs) {
                    if (glyph === null) {
                        x += fontDirection * wordSpacing;
                        continue;
                    } else if (a.isNum(glyph)) {
                        x += spacingDir * glyph * fontSize / 1000;
                        continue;
                    }
                    const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
                    const character = glyph.fontChar;
                    let scaledX, scaledY;
                    let width = glyph.width;
                    if (vertical) {
                        let vx;
                        const vmetric = glyph.vmetric || defaultVMetrics;
                        vx = glyph.vmetric ? vmetric[1] : width * 0.5;
                        vx = -vx * widthAdvanceScale;
                        const vy = vmetric[2] * widthAdvanceScale;
                        width = vmetric ? -vmetric[0] : width;
                        scaledX = vx / fontSizeScale;
                        scaledY = (x + vy) / fontSizeScale;
                    } else {
                        scaledX = x / fontSizeScale;
                        scaledY = 0;
                    }
                    if (glyph.isInFont || font.missingFile) {
                        current.xcoords.push(current.x + scaledX);
                        if (vertical) {
                            current.ycoords.push(-current.y + scaledY);
                        }
                        current.tspan.textContent += character;
                    } else {
                    }
                    let charWidth;
                    if (vertical) {
                        charWidth = width * widthAdvanceScale - spacing * fontDirection;
                    } else {
                        charWidth = width * widthAdvanceScale + spacing * fontDirection;
                    }
                    x += charWidth;
                }
                current.tspan.setAttributeNS(null, 'x', current.xcoords.map(pf).join(' '));
                if (vertical) {
                    current.tspan.setAttributeNS(null, 'y', current.ycoords.map(pf).join(' '));
                } else {
                    current.tspan.setAttributeNS(null, 'y', pf(-current.y));
                }
                if (vertical) {
                    current.y -= x;
                } else {
                    current.x += x * textHScale;
                }
                current.tspan.setAttributeNS(null, 'font-family', current.fontFamily);
                current.tspan.setAttributeNS(null, 'font-size', `${ pf(current.fontSize) }px`);
                if (current.fontStyle !== SVG_DEFAULTS.fontStyle) {
                    current.tspan.setAttributeNS(null, 'font-style', current.fontStyle);
                }
                if (current.fontWeight !== SVG_DEFAULTS.fontWeight) {
                    current.tspan.setAttributeNS(null, 'font-weight', current.fontWeight);
                }
                const fillStrokeMode = current.textRenderingMode & a.TextRenderingMode.FILL_STROKE_MASK;
                if (fillStrokeMode === a.TextRenderingMode.FILL || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                    if (current.fillColor !== SVG_DEFAULTS.fillColor) {
                        current.tspan.setAttributeNS(null, 'fill', current.fillColor);
                    }
                    if (current.fillAlpha < 1) {
                        current.tspan.setAttributeNS(null, 'fill-opacity', current.fillAlpha);
                    }
                } else if (current.textRenderingMode === a.TextRenderingMode.ADD_TO_PATH) {
                    current.tspan.setAttributeNS(null, 'fill', 'transparent');
                } else {
                    current.tspan.setAttributeNS(null, 'fill', 'none');
                }
                if (fillStrokeMode === a.TextRenderingMode.STROKE || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                    const lineWidthScale = 1 / (current.textMatrixScale || 1);
                    this._setStrokeAttributes(current.tspan, lineWidthScale);
                }
                let textMatrix = current.textMatrix;
                if (current.textRise !== 0) {
                    textMatrix = textMatrix.slice();
                    textMatrix[5] += current.textRise;
                }
                current.txtElement.setAttributeNS(null, 'transform', `${ pm(textMatrix) } scale(${ pf(textHScale) }, -1)`);
                current.txtElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
                current.txtElement.appendChild(current.tspan);
                current.txtgrp.appendChild(current.txtElement);
                this._ensureTransformGroup().appendChild(current.txtElement);
            }
            setLeadingMoveText(x, y) {
                this.setLeading(-y);
                this.moveText(x, y);
            }
            addFontStyle(fontObj) {
                if (!fontObj.data) {
                    throw new Error('addFontStyle: No font data available, ' + 'ensure that the "fontExtraProperties" API parameter is set.');
                }
                if (!this.cssStyle) {
                    this.cssStyle = this.svgFactory.createElement('svg:style');
                    this.cssStyle.setAttributeNS(null, 'type', 'text/css');
                    this.defs.appendChild(this.cssStyle);
                }
                const url = a.createObjectURL(fontObj.data, fontObj.mimetype, this.forceDataSchema);
                this.cssStyle.textContent += `@font-face { font-family: "${ fontObj.loadedName }";` + ` src: url(${ url }); }\n`;
            }
            setFont(details) {
                const current = this.current;
                const fontObj = this.commonObjs.get(details[0]);
                let size = details[1];
                current.font = fontObj;
                if (this.embedFonts && !fontObj.missingFile && !this.embeddedFonts[fontObj.loadedName]) {
                    this.addFontStyle(fontObj);
                    this.embeddedFonts[fontObj.loadedName] = fontObj;
                }
                current.fontMatrix = fontObj.fontMatrix || a.FONT_IDENTITY_MATRIX;
                let bold = 'normal';
                if (fontObj.black) {
                    bold = '900';
                } else if (fontObj.bold) {
                    bold = 'bold';
                }
                const italic = fontObj.italic ? 'italic' : 'normal';
                if (size < 0) {
                    size = -size;
                    current.fontDirection = -1;
                } else {
                    current.fontDirection = 1;
                }
                current.fontSize = size;
                current.fontFamily = fontObj.loadedName;
                current.fontWeight = bold;
                current.fontStyle = italic;
                current.tspan = this.svgFactory.createElement('svg:tspan');
                current.tspan.setAttributeNS(null, 'y', pf(-current.y));
                current.xcoords = [];
                current.ycoords = [];
            }
            endText() {
                const current = this.current;
                if (current.textRenderingMode & a.TextRenderingMode.ADD_TO_PATH_FLAG && current.txtElement && current.txtElement.hasChildNodes()) {
                    current.element = current.txtElement;
                    this.clip('nonzero');
                    this.endPath();
                }
            }
            setLineWidth(width) {
                if (width > 0) {
                    this.current.lineWidth = width;
                }
            }
            setLineCap(style) {
                this.current.lineCap = LINE_CAP_STYLES[style];
            }
            setLineJoin(style) {
                this.current.lineJoin = LINE_JOIN_STYLES[style];
            }
            setMiterLimit(limit) {
                this.current.miterLimit = limit;
            }
            setStrokeAlpha(strokeAlpha) {
                this.current.strokeAlpha = strokeAlpha;
            }
            setStrokeRGBColor(r, g, b) {
                this.current.strokeColor = a.Util.makeHexColor(r, g, b);
            }
            setFillAlpha(fillAlpha) {
                this.current.fillAlpha = fillAlpha;
            }
            setFillRGBColor(r, g, b) {
                this.current.fillColor = a.Util.makeHexColor(r, g, b);
                this.current.tspan = this.svgFactory.createElement('svg:tspan');
                this.current.xcoords = [];
                this.current.ycoords = [];
            }
            setStrokeColorN(args) {
                this.current.strokeColor = this._makeColorN_Pattern(args);
            }
            setFillColorN(args) {
                this.current.fillColor = this._makeColorN_Pattern(args);
            }
            shadingFill(args) {
                const width = this.viewport.width;
                const height = this.viewport.height;
                const inv = a.Util.inverseTransform(this.transformMatrix);
                const bl = a.Util.applyTransform([
                    0,
                    0
                ], inv);
                const br = a.Util.applyTransform([
                    0,
                    height
                ], inv);
                const ul = a.Util.applyTransform([
                    width,
                    0
                ], inv);
                const ur = a.Util.applyTransform([
                    width,
                    height
                ], inv);
                const x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
                const y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
                const x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
                const y1 = Math.max(bl[1], br[1], ul[1], ur[1]);
                const rect = this.svgFactory.createElement('svg:rect');
                rect.setAttributeNS(null, 'x', x0);
                rect.setAttributeNS(null, 'y', y0);
                rect.setAttributeNS(null, 'width', x1 - x0);
                rect.setAttributeNS(null, 'height', y1 - y0);
                rect.setAttributeNS(null, 'fill', this._makeShadingPattern(args));
                if (this.current.fillAlpha < 1) {
                    rect.setAttributeNS(null, 'fill-opacity', this.current.fillAlpha);
                }
                this._ensureTransformGroup().appendChild(rect);
            }
            _makeColorN_Pattern(args) {
                if (args[0] === 'TilingPattern') {
                    return this._makeTilingPattern(args);
                }
                return this._makeShadingPattern(args);
            }
            _makeTilingPattern(args) {
                const color = args[1];
                const operatorList = args[2];
                const matrix = args[3] || a.IDENTITY_MATRIX;
                const [x0, y0, x1, y1] = args[4];
                const xstep = args[5];
                const ystep = args[6];
                const paintType = args[7];
                const tilingId = `shading${ shadingCount++ }`;
                const [tx0, ty0] = a.Util.applyTransform([
                    x0,
                    y0
                ], matrix);
                const [tx1, ty1] = a.Util.applyTransform([
                    x1,
                    y1
                ], matrix);
                const [xscale, yscale] = a.Util.singularValueDecompose2dScale(matrix);
                const txstep = xstep * xscale;
                const tystep = ystep * yscale;
                const tiling = this.svgFactory.createElement('svg:pattern');
                tiling.setAttributeNS(null, 'id', tilingId);
                tiling.setAttributeNS(null, 'patternUnits', 'userSpaceOnUse');
                tiling.setAttributeNS(null, 'width', txstep);
                tiling.setAttributeNS(null, 'height', tystep);
                tiling.setAttributeNS(null, 'x', `${ tx0 }`);
                tiling.setAttributeNS(null, 'y', `${ ty0 }`);
                const svg = this.svg;
                const transformMatrix = this.transformMatrix;
                const fillColor = this.current.fillColor;
                const strokeColor = this.current.strokeColor;
                const bbox = this.svgFactory.create(tx1 - tx0, ty1 - ty0);
                this.svg = bbox;
                this.transformMatrix = matrix;
                if (paintType === 2) {
                    const cssColor = a.Util.makeHexColor(...color);
                    this.current.fillColor = cssColor;
                    this.current.strokeColor = cssColor;
                }
                this.executeOpTree(this.convertOpList(operatorList));
                this.svg = svg;
                this.transformMatrix = transformMatrix;
                this.current.fillColor = fillColor;
                this.current.strokeColor = strokeColor;
                tiling.appendChild(bbox.childNodes[0]);
                this.defs.appendChild(tiling);
                return `url(#${ tilingId })`;
            }
            _makeShadingPattern(args) {
                switch (args[0]) {
                case 'RadialAxial':
                    const shadingId = `shading${ shadingCount++ }`;
                    const colorStops = args[3];
                    let gradient;
                    switch (args[1]) {
                    case 'axial':
                        const point0 = args[4];
                        const point1 = args[5];
                        gradient = this.svgFactory.createElement('svg:linearGradient');
                        gradient.setAttributeNS(null, 'id', shadingId);
                        gradient.setAttributeNS(null, 'gradientUnits', 'userSpaceOnUse');
                        gradient.setAttributeNS(null, 'x1', point0[0]);
                        gradient.setAttributeNS(null, 'y1', point0[1]);
                        gradient.setAttributeNS(null, 'x2', point1[0]);
                        gradient.setAttributeNS(null, 'y2', point1[1]);
                        break;
                    case 'radial':
                        const focalPoint = args[4];
                        const circlePoint = args[5];
                        const focalRadius = args[6];
                        const circleRadius = args[7];
                        gradient = this.svgFactory.createElement('svg:radialGradient');
                        gradient.setAttributeNS(null, 'id', shadingId);
                        gradient.setAttributeNS(null, 'gradientUnits', 'userSpaceOnUse');
                        gradient.setAttributeNS(null, 'cx', circlePoint[0]);
                        gradient.setAttributeNS(null, 'cy', circlePoint[1]);
                        gradient.setAttributeNS(null, 'r', circleRadius);
                        gradient.setAttributeNS(null, 'fx', focalPoint[0]);
                        gradient.setAttributeNS(null, 'fy', focalPoint[1]);
                        gradient.setAttributeNS(null, 'fr', focalRadius);
                        break;
                    default:
                        throw new Error(`Unknown RadialAxial type: ${ args[1] }`);
                    }
                    for (const colorStop of colorStops) {
                        const stop = this.svgFactory.createElement('svg:stop');
                        stop.setAttributeNS(null, 'offset', colorStop[0]);
                        stop.setAttributeNS(null, 'stop-color', colorStop[1]);
                        gradient.appendChild(stop);
                    }
                    this.defs.appendChild(gradient);
                    return `url(#${ shadingId })`;
                case 'Mesh':
                    a.warn('Unimplemented pattern Mesh');
                    return null;
                case 'Dummy':
                    return 'hotpink';
                default:
                    throw new Error(`Unknown IR type: ${ args[0] }`);
                }
            }
            setDash(dashArray, dashPhase) {
                this.current.dashArray = dashArray;
                this.current.dashPhase = dashPhase;
            }
            constructPath(ops, args) {
                const current = this.current;
                let x = current.x, y = current.y;
                let d = [];
                let j = 0;
                for (const op of ops) {
                    switch (op | 0) {
                    case a.OPS.rectangle:
                        x = args[j++];
                        y = args[j++];
                        const width = args[j++];
                        const height = args[j++];
                        const xw = x + width;
                        const yh = y + height;
                        d.push('M', pf(x), pf(y), 'L', pf(xw), pf(y), 'L', pf(xw), pf(yh), 'L', pf(x), pf(yh), 'Z');
                        break;
                    case a.OPS.moveTo:
                        x = args[j++];
                        y = args[j++];
                        d.push('M', pf(x), pf(y));
                        break;
                    case a.OPS.lineTo:
                        x = args[j++];
                        y = args[j++];
                        d.push('L', pf(x), pf(y));
                        break;
                    case a.OPS.curveTo:
                        x = args[j + 4];
                        y = args[j + 5];
                        d.push('C', pf(args[j]), pf(args[j + 1]), pf(args[j + 2]), pf(args[j + 3]), pf(x), pf(y));
                        j += 6;
                        break;
                    case a.OPS.curveTo2:
                        d.push('C', pf(x), pf(y), pf(args[j]), pf(args[j + 1]), pf(args[j + 2]), pf(args[j + 3]));
                        x = args[j + 2];
                        y = args[j + 3];
                        j += 4;
                        break;
                    case a.OPS.curveTo3:
                        x = args[j + 2];
                        y = args[j + 3];
                        d.push('C', pf(args[j]), pf(args[j + 1]), pf(x), pf(y), pf(x), pf(y));
                        j += 4;
                        break;
                    case a.OPS.closePath:
                        d.push('Z');
                        break;
                    }
                }
                d = d.join(' ');
                if (current.path && ops.length > 0 && ops[0] !== a.OPS.rectangle && ops[0] !== a.OPS.moveTo) {
                    d = current.path.getAttributeNS(null, 'd') + d;
                } else {
                    current.path = this.svgFactory.createElement('svg:path');
                    this._ensureTransformGroup().appendChild(current.path);
                }
                current.path.setAttributeNS(null, 'd', d);
                current.path.setAttributeNS(null, 'fill', 'none');
                current.element = current.path;
                current.setCurrentPoint(x, y);
            }
            endPath() {
                const current = this.current;
                current.path = null;
                if (!this.pendingClip) {
                    return;
                }
                if (!current.element) {
                    this.pendingClip = null;
                    return;
                }
                const clipId = `clippath${ clipCount++ }`;
                const clipPath = this.svgFactory.createElement('svg:clipPath');
                clipPath.setAttributeNS(null, 'id', clipId);
                clipPath.setAttributeNS(null, 'transform', pm(this.transformMatrix));
                const clipElement = current.element.cloneNode(true);
                if (this.pendingClip === 'evenodd') {
                    clipElement.setAttributeNS(null, 'clip-rule', 'evenodd');
                } else {
                    clipElement.setAttributeNS(null, 'clip-rule', 'nonzero');
                }
                this.pendingClip = null;
                clipPath.appendChild(clipElement);
                this.defs.appendChild(clipPath);
                if (current.activeClipUrl) {
                    current.clipGroup = null;
                    this.extraStack.forEach(function (prev) {
                        prev.clipGroup = null;
                    });
                    clipPath.setAttributeNS(null, 'clip-path', current.activeClipUrl);
                }
                current.activeClipUrl = `url(#${ clipId })`;
                this.tgrp = null;
            }
            clip(type) {
                this.pendingClip = type;
            }
            closePath() {
                const current = this.current;
                if (current.path) {
                    const d = `${ current.path.getAttributeNS(null, 'd') }Z`;
                    current.path.setAttributeNS(null, 'd', d);
                }
            }
            setLeading(leading) {
                this.current.leading = -leading;
            }
            setTextRise(textRise) {
                this.current.textRise = textRise;
            }
            setTextRenderingMode(textRenderingMode) {
                this.current.textRenderingMode = textRenderingMode;
            }
            setHScale(scale) {
                this.current.textHScale = scale / 100;
            }
            setRenderingIntent(intent) {
            }
            setFlatness(flatness) {
            }
            setGState(states) {
                for (const [key, value] of states) {
                    switch (key) {
                    case 'LW':
                        this.setLineWidth(value);
                        break;
                    case 'LC':
                        this.setLineCap(value);
                        break;
                    case 'LJ':
                        this.setLineJoin(value);
                        break;
                    case 'ML':
                        this.setMiterLimit(value);
                        break;
                    case 'D':
                        this.setDash(value[0], value[1]);
                        break;
                    case 'RI':
                        this.setRenderingIntent(value);
                        break;
                    case 'FL':
                        this.setFlatness(value);
                        break;
                    case 'Font':
                        this.setFont(value);
                        break;
                    case 'CA':
                        this.setStrokeAlpha(value);
                        break;
                    case 'ca':
                        this.setFillAlpha(value);
                        break;
                    default:
                        a.warn(`Unimplemented graphic state operator ${ key }`);
                        break;
                    }
                }
            }
            fill() {
                const current = this.current;
                if (current.element) {
                    current.element.setAttributeNS(null, 'fill', current.fillColor);
                    current.element.setAttributeNS(null, 'fill-opacity', current.fillAlpha);
                    this.endPath();
                }
            }
            stroke() {
                const current = this.current;
                if (current.element) {
                    this._setStrokeAttributes(current.element);
                    current.element.setAttributeNS(null, 'fill', 'none');
                    this.endPath();
                }
            }
            _setStrokeAttributes(element, lineWidthScale = 1) {
                const current = this.current;
                let dashArray = current.dashArray;
                if (lineWidthScale !== 1 && dashArray.length > 0) {
                    dashArray = dashArray.map(function (value) {
                        return lineWidthScale * value;
                    });
                }
                element.setAttributeNS(null, 'stroke', current.strokeColor);
                element.setAttributeNS(null, 'stroke-opacity', current.strokeAlpha);
                element.setAttributeNS(null, 'stroke-miterlimit', pf(current.miterLimit));
                element.setAttributeNS(null, 'stroke-linecap', current.lineCap);
                element.setAttributeNS(null, 'stroke-linejoin', current.lineJoin);
                element.setAttributeNS(null, 'stroke-width', pf(lineWidthScale * current.lineWidth) + 'px');
                element.setAttributeNS(null, 'stroke-dasharray', dashArray.map(pf).join(' '));
                element.setAttributeNS(null, 'stroke-dashoffset', pf(lineWidthScale * current.dashPhase) + 'px');
            }
            eoFill() {
                if (this.current.element) {
                    this.current.element.setAttributeNS(null, 'fill-rule', 'evenodd');
                }
                this.fill();
            }
            fillStroke() {
                this.stroke();
                this.fill();
            }
            eoFillStroke() {
                if (this.current.element) {
                    this.current.element.setAttributeNS(null, 'fill-rule', 'evenodd');
                }
                this.fillStroke();
            }
            closeStroke() {
                this.closePath();
                this.stroke();
            }
            closeFillStroke() {
                this.closePath();
                this.fillStroke();
            }
            closeEOFillStroke() {
                this.closePath();
                this.eoFillStroke();
            }
            paintSolidColorImageMask() {
                const rect = this.svgFactory.createElement('svg:rect');
                rect.setAttributeNS(null, 'x', '0');
                rect.setAttributeNS(null, 'y', '0');
                rect.setAttributeNS(null, 'width', '1px');
                rect.setAttributeNS(null, 'height', '1px');
                rect.setAttributeNS(null, 'fill', this.current.fillColor);
                this._ensureTransformGroup().appendChild(rect);
            }
            paintImageXObject(objId) {
                const imgData = objId.startsWith('g_') ? this.commonObjs.get(objId) : this.objs.get(objId);
                if (!imgData) {
                    a.warn(`Dependent image with object ID ${ objId } is not ready yet`);
                    return;
                }
                this.paintInlineImageXObject(imgData);
            }
            paintInlineImageXObject(imgData, mask) {
                const width = imgData.width;
                const height = imgData.height;
                const imgSrc = convertImgDataToPng(imgData, this.forceDataSchema, !!mask);
                const cliprect = this.svgFactory.createElement('svg:rect');
                cliprect.setAttributeNS(null, 'x', '0');
                cliprect.setAttributeNS(null, 'y', '0');
                cliprect.setAttributeNS(null, 'width', pf(width));
                cliprect.setAttributeNS(null, 'height', pf(height));
                this.current.element = cliprect;
                this.clip('nonzero');
                const imgEl = this.svgFactory.createElement('svg:image');
                imgEl.setAttributeNS(XLINK_NS, 'xlink:href', imgSrc);
                imgEl.setAttributeNS(null, 'x', '0');
                imgEl.setAttributeNS(null, 'y', pf(-height));
                imgEl.setAttributeNS(null, 'width', pf(width) + 'px');
                imgEl.setAttributeNS(null, 'height', pf(height) + 'px');
                imgEl.setAttributeNS(null, 'transform', `scale(${ pf(1 / width) } ${ pf(-1 / height) })`);
                if (mask) {
                    mask.appendChild(imgEl);
                } else {
                    this._ensureTransformGroup().appendChild(imgEl);
                }
            }
            paintImageMaskXObject(imgData) {
                const current = this.current;
                const width = imgData.width;
                const height = imgData.height;
                const fillColor = current.fillColor;
                current.maskId = `mask${ maskCount++ }`;
                const mask = this.svgFactory.createElement('svg:mask');
                mask.setAttributeNS(null, 'id', current.maskId);
                const rect = this.svgFactory.createElement('svg:rect');
                rect.setAttributeNS(null, 'x', '0');
                rect.setAttributeNS(null, 'y', '0');
                rect.setAttributeNS(null, 'width', pf(width));
                rect.setAttributeNS(null, 'height', pf(height));
                rect.setAttributeNS(null, 'fill', fillColor);
                rect.setAttributeNS(null, 'mask', `url(#${ current.maskId })`);
                this.defs.appendChild(mask);
                this._ensureTransformGroup().appendChild(rect);
                this.paintInlineImageXObject(imgData, mask);
            }
            paintFormXObjectBegin(matrix, bbox) {
                if (Array.isArray(matrix) && matrix.length === 6) {
                    this.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
                }
                if (bbox) {
                    const width = bbox[2] - bbox[0];
                    const height = bbox[3] - bbox[1];
                    const cliprect = this.svgFactory.createElement('svg:rect');
                    cliprect.setAttributeNS(null, 'x', bbox[0]);
                    cliprect.setAttributeNS(null, 'y', bbox[1]);
                    cliprect.setAttributeNS(null, 'width', pf(width));
                    cliprect.setAttributeNS(null, 'height', pf(height));
                    this.current.element = cliprect;
                    this.clip('nonzero');
                    this.endPath();
                }
            }
            paintFormXObjectEnd() {
            }
            _initialize(viewport) {
                const svg = this.svgFactory.create(viewport.width, viewport.height);
                const definitions = this.svgFactory.createElement('svg:defs');
                svg.appendChild(definitions);
                this.defs = definitions;
                const rootGroup = this.svgFactory.createElement('svg:g');
                rootGroup.setAttributeNS(null, 'transform', pm(viewport.transform));
                svg.appendChild(rootGroup);
                this.svg = rootGroup;
                return svg;
            }
            _ensureClipGroup() {
                if (!this.current.clipGroup) {
                    const clipGroup = this.svgFactory.createElement('svg:g');
                    clipGroup.setAttributeNS(null, 'clip-path', this.current.activeClipUrl);
                    this.svg.appendChild(clipGroup);
                    this.current.clipGroup = clipGroup;
                }
                return this.current.clipGroup;
            }
            _ensureTransformGroup() {
                if (!this.tgrp) {
                    this.tgrp = this.svgFactory.createElement('svg:g');
                    this.tgrp.setAttributeNS(null, 'transform', pm(this.transformMatrix));
                    if (this.current.activeClipUrl) {
                        this._ensureClipGroup().appendChild(this.tgrp);
                    } else {
                        this.svg.appendChild(this.tgrp);
                    }
                }
                return this.tgrp;
            }
        };
    }
    return { SVGGraphics };
});