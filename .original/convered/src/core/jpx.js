define([
    '../shared/util.js',
    './core_utils.js',
    './arithmetic_decoder.js'
], function (a, b, c) {
    'use strict';
    class JpxError extends a.BaseException {
        constructor(msg) {
            super(`JPX error: ${ msg }`);
        }
    }
    var JpxImage = function JpxImageClosure() {
        var SubbandsGainLog2 = {
            LL: 0,
            LH: 1,
            HL: 1,
            HH: 2
        };
        function JpxImage() {
            this.failOnCorruptedImage = false;
        }
        JpxImage.prototype = {
            parse: function JpxImage_parse(data) {
                var head = b.readUint16(data, 0);
                if (head === 65359) {
                    this.parseCodestream(data, 0, data.length);
                    return;
                }
                var position = 0, length = data.length;
                while (position < length) {
                    var headerSize = 8;
                    var lbox = b.readUint32(data, position);
                    var tbox = b.readUint32(data, position + 4);
                    position += headerSize;
                    if (lbox === 1) {
                        lbox = b.readUint32(data, position) * 4294967296 + b.readUint32(data, position + 4);
                        position += 8;
                        headerSize += 8;
                    }
                    if (lbox === 0) {
                        lbox = length - position + headerSize;
                    }
                    if (lbox < headerSize) {
                        throw new JpxError('Invalid box field size');
                    }
                    var dataLength = lbox - headerSize;
                    var jumpDataLength = true;
                    switch (tbox) {
                    case 1785737832:
                        jumpDataLength = false;
                        break;
                    case 1668246642:
                        var method = data[position];
                        if (method === 1) {
                            var colorspace = b.readUint32(data, position + 3);
                            switch (colorspace) {
                            case 16:
                            case 17:
                            case 18:
                                break;
                            default:
                                a.warn('Unknown colorspace ' + colorspace);
                                break;
                            }
                        } else if (method === 2) {
                            a.info('ICC profile not supported');
                        }
                        break;
                    case 1785737827:
                        this.parseCodestream(data, position, position + dataLength);
                        break;
                    case 1783636000:
                        if (b.readUint32(data, position) !== 218793738) {
                            a.warn('Invalid JP2 signature');
                        }
                        break;
                    case 1783634458:
                    case 1718909296:
                    case 1920099697:
                    case 1919251232:
                    case 1768449138:
                        break;
                    default:
                        var headerType = String.fromCharCode(tbox >> 24 & 255, tbox >> 16 & 255, tbox >> 8 & 255, tbox & 255);
                        a.warn('Unsupported header type ' + tbox + ' (' + headerType + ')');
                        break;
                    }
                    if (jumpDataLength) {
                        position += dataLength;
                    }
                }
            },
            parseImageProperties: function JpxImage_parseImageProperties(stream) {
                var newByte = stream.getByte();
                while (newByte >= 0) {
                    var oldByte = newByte;
                    newByte = stream.getByte();
                    var code = oldByte << 8 | newByte;
                    if (code === 65361) {
                        stream.skip(4);
                        var Xsiz = stream.getInt32() >>> 0;
                        var Ysiz = stream.getInt32() >>> 0;
                        var XOsiz = stream.getInt32() >>> 0;
                        var YOsiz = stream.getInt32() >>> 0;
                        stream.skip(16);
                        var Csiz = stream.getUint16();
                        this.width = Xsiz - XOsiz;
                        this.height = Ysiz - YOsiz;
                        this.componentsCount = Csiz;
                        this.bitsPerComponent = 8;
                        return;
                    }
                }
                throw new JpxError('No size marker found in JPX stream');
            },
            parseCodestream: function JpxImage_parseCodestream(data, start, end) {
                var context = {};
                var doNotRecover = false;
                try {
                    var position = start;
                    while (position + 1 < end) {
                        var code = b.readUint16(data, position);
                        position += 2;
                        var length = 0, j, sqcd, spqcds, spqcdSize, scalarExpounded, tile;
                        switch (code) {
                        case 65359:
                            context.mainHeader = true;
                            break;
                        case 65497:
                            break;
                        case 65361:
                            length = b.readUint16(data, position);
                            var siz = {};
                            siz.Xsiz = b.readUint32(data, position + 4);
                            siz.Ysiz = b.readUint32(data, position + 8);
                            siz.XOsiz = b.readUint32(data, position + 12);
                            siz.YOsiz = b.readUint32(data, position + 16);
                            siz.XTsiz = b.readUint32(data, position + 20);
                            siz.YTsiz = b.readUint32(data, position + 24);
                            siz.XTOsiz = b.readUint32(data, position + 28);
                            siz.YTOsiz = b.readUint32(data, position + 32);
                            var componentsCount = b.readUint16(data, position + 36);
                            siz.Csiz = componentsCount;
                            var components = [];
                            j = position + 38;
                            for (var i = 0; i < componentsCount; i++) {
                                var component = {
                                    precision: (data[j] & 127) + 1,
                                    isSigned: !!(data[j] & 128),
                                    XRsiz: data[j + 1],
                                    YRsiz: data[j + 2]
                                };
                                j += 3;
                                calculateComponentDimensions(component, siz);
                                components.push(component);
                            }
                            context.SIZ = siz;
                            context.components = components;
                            calculateTileGrids(context, components);
                            context.QCC = [];
                            context.COC = [];
                            break;
                        case 65372:
                            length = b.readUint16(data, position);
                            var qcd = {};
                            j = position + 2;
                            sqcd = data[j++];
                            switch (sqcd & 31) {
                            case 0:
                                spqcdSize = 8;
                                scalarExpounded = true;
                                break;
                            case 1:
                                spqcdSize = 16;
                                scalarExpounded = false;
                                break;
                            case 2:
                                spqcdSize = 16;
                                scalarExpounded = true;
                                break;
                            default:
                                throw new Error('Invalid SQcd value ' + sqcd);
                            }
                            qcd.noQuantization = spqcdSize === 8;
                            qcd.scalarExpounded = scalarExpounded;
                            qcd.guardBits = sqcd >> 5;
                            spqcds = [];
                            while (j < length + position) {
                                var spqcd = {};
                                if (spqcdSize === 8) {
                                    spqcd.epsilon = data[j++] >> 3;
                                    spqcd.mu = 0;
                                } else {
                                    spqcd.epsilon = data[j] >> 3;
                                    spqcd.mu = (data[j] & 7) << 8 | data[j + 1];
                                    j += 2;
                                }
                                spqcds.push(spqcd);
                            }
                            qcd.SPqcds = spqcds;
                            if (context.mainHeader) {
                                context.QCD = qcd;
                            } else {
                                context.currentTile.QCD = qcd;
                                context.currentTile.QCC = [];
                            }
                            break;
                        case 65373:
                            length = b.readUint16(data, position);
                            var qcc = {};
                            j = position + 2;
                            var cqcc;
                            if (context.SIZ.Csiz < 257) {
                                cqcc = data[j++];
                            } else {
                                cqcc = b.readUint16(data, j);
                                j += 2;
                            }
                            sqcd = data[j++];
                            switch (sqcd & 31) {
                            case 0:
                                spqcdSize = 8;
                                scalarExpounded = true;
                                break;
                            case 1:
                                spqcdSize = 16;
                                scalarExpounded = false;
                                break;
                            case 2:
                                spqcdSize = 16;
                                scalarExpounded = true;
                                break;
                            default:
                                throw new Error('Invalid SQcd value ' + sqcd);
                            }
                            qcc.noQuantization = spqcdSize === 8;
                            qcc.scalarExpounded = scalarExpounded;
                            qcc.guardBits = sqcd >> 5;
                            spqcds = [];
                            while (j < length + position) {
                                spqcd = {};
                                if (spqcdSize === 8) {
                                    spqcd.epsilon = data[j++] >> 3;
                                    spqcd.mu = 0;
                                } else {
                                    spqcd.epsilon = data[j] >> 3;
                                    spqcd.mu = (data[j] & 7) << 8 | data[j + 1];
                                    j += 2;
                                }
                                spqcds.push(spqcd);
                            }
                            qcc.SPqcds = spqcds;
                            if (context.mainHeader) {
                                context.QCC[cqcc] = qcc;
                            } else {
                                context.currentTile.QCC[cqcc] = qcc;
                            }
                            break;
                        case 65362:
                            length = b.readUint16(data, position);
                            var cod = {};
                            j = position + 2;
                            var scod = data[j++];
                            cod.entropyCoderWithCustomPrecincts = !!(scod & 1);
                            cod.sopMarkerUsed = !!(scod & 2);
                            cod.ephMarkerUsed = !!(scod & 4);
                            cod.progressionOrder = data[j++];
                            cod.layersCount = b.readUint16(data, j);
                            j += 2;
                            cod.multipleComponentTransform = data[j++];
                            cod.decompositionLevelsCount = data[j++];
                            cod.xcb = (data[j++] & 15) + 2;
                            cod.ycb = (data[j++] & 15) + 2;
                            var blockStyle = data[j++];
                            cod.selectiveArithmeticCodingBypass = !!(blockStyle & 1);
                            cod.resetContextProbabilities = !!(blockStyle & 2);
                            cod.terminationOnEachCodingPass = !!(blockStyle & 4);
                            cod.verticallyStripe = !!(blockStyle & 8);
                            cod.predictableTermination = !!(blockStyle & 16);
                            cod.segmentationSymbolUsed = !!(blockStyle & 32);
                            cod.reversibleTransformation = data[j++];
                            if (cod.entropyCoderWithCustomPrecincts) {
                                var precinctsSizes = [];
                                while (j < length + position) {
                                    var precinctsSize = data[j++];
                                    precinctsSizes.push({
                                        PPx: precinctsSize & 15,
                                        PPy: precinctsSize >> 4
                                    });
                                }
                                cod.precinctsSizes = precinctsSizes;
                            }
                            var unsupported = [];
                            if (cod.selectiveArithmeticCodingBypass) {
                                unsupported.push('selectiveArithmeticCodingBypass');
                            }
                            if (cod.resetContextProbabilities) {
                                unsupported.push('resetContextProbabilities');
                            }
                            if (cod.terminationOnEachCodingPass) {
                                unsupported.push('terminationOnEachCodingPass');
                            }
                            if (cod.verticallyStripe) {
                                unsupported.push('verticallyStripe');
                            }
                            if (cod.predictableTermination) {
                                unsupported.push('predictableTermination');
                            }
                            if (unsupported.length > 0) {
                                doNotRecover = true;
                                a.warn(`JPX: Unsupported COD options (${ unsupported.join(', ') }).`);
                            }
                            if (context.mainHeader) {
                                context.COD = cod;
                            } else {
                                context.currentTile.COD = cod;
                                context.currentTile.COC = [];
                            }
                            break;
                        case 65424:
                            length = b.readUint16(data, position);
                            tile = {};
                            tile.index = b.readUint16(data, position + 2);
                            tile.length = b.readUint32(data, position + 4);
                            tile.dataEnd = tile.length + position - 2;
                            tile.partIndex = data[position + 8];
                            tile.partsCount = data[position + 9];
                            context.mainHeader = false;
                            if (tile.partIndex === 0) {
                                tile.COD = context.COD;
                                tile.COC = context.COC.slice(0);
                                tile.QCD = context.QCD;
                                tile.QCC = context.QCC.slice(0);
                            }
                            context.currentTile = tile;
                            break;
                        case 65427:
                            tile = context.currentTile;
                            if (tile.partIndex === 0) {
                                initializeTile(context, tile.index);
                                buildPackets(context);
                            }
                            length = tile.dataEnd - position;
                            parseTilePackets(context, data, position, length);
                            break;
                        case 65363:
                            a.warn('JPX: Codestream code 0xFF53 (COC) is not implemented.');
                        case 65365:
                        case 65367:
                        case 65368:
                        case 65380:
                            length = b.readUint16(data, position);
                            break;
                        default:
                            throw new Error('Unknown codestream code: ' + code.toString(16));
                        }
                        position += length;
                    }
                } catch (e) {
                    if (doNotRecover || this.failOnCorruptedImage) {
                        throw new JpxError(e.message);
                    } else {
                        a.warn(`JPX: Trying to recover from: "${ e.message }".`);
                    }
                }
                this.tiles = transformComponents(context);
                this.width = context.SIZ.Xsiz - context.SIZ.XOsiz;
                this.height = context.SIZ.Ysiz - context.SIZ.YOsiz;
                this.componentsCount = context.SIZ.Csiz;
            }
        };
        function calculateComponentDimensions(component, siz) {
            component.x0 = Math.ceil(siz.XOsiz / component.XRsiz);
            component.x1 = Math.ceil(siz.Xsiz / component.XRsiz);
            component.y0 = Math.ceil(siz.YOsiz / component.YRsiz);
            component.y1 = Math.ceil(siz.Ysiz / component.YRsiz);
            component.width = component.x1 - component.x0;
            component.height = component.y1 - component.y0;
        }
        function calculateTileGrids(context, components) {
            var siz = context.SIZ;
            var tile, tiles = [];
            var numXtiles = Math.ceil((siz.Xsiz - siz.XTOsiz) / siz.XTsiz);
            var numYtiles = Math.ceil((siz.Ysiz - siz.YTOsiz) / siz.YTsiz);
            for (var q = 0; q < numYtiles; q++) {
                for (var p = 0; p < numXtiles; p++) {
                    tile = {};
                    tile.tx0 = Math.max(siz.XTOsiz + p * siz.XTsiz, siz.XOsiz);
                    tile.ty0 = Math.max(siz.YTOsiz + q * siz.YTsiz, siz.YOsiz);
                    tile.tx1 = Math.min(siz.XTOsiz + (p + 1) * siz.XTsiz, siz.Xsiz);
                    tile.ty1 = Math.min(siz.YTOsiz + (q + 1) * siz.YTsiz, siz.Ysiz);
                    tile.width = tile.tx1 - tile.tx0;
                    tile.height = tile.ty1 - tile.ty0;
                    tile.components = [];
                    tiles.push(tile);
                }
            }
            context.tiles = tiles;
            var componentsCount = siz.Csiz;
            for (var i = 0, ii = componentsCount; i < ii; i++) {
                var component = components[i];
                for (var j = 0, jj = tiles.length; j < jj; j++) {
                    var tileComponent = {};
                    tile = tiles[j];
                    tileComponent.tcx0 = Math.ceil(tile.tx0 / component.XRsiz);
                    tileComponent.tcy0 = Math.ceil(tile.ty0 / component.YRsiz);
                    tileComponent.tcx1 = Math.ceil(tile.tx1 / component.XRsiz);
                    tileComponent.tcy1 = Math.ceil(tile.ty1 / component.YRsiz);
                    tileComponent.width = tileComponent.tcx1 - tileComponent.tcx0;
                    tileComponent.height = tileComponent.tcy1 - tileComponent.tcy0;
                    tile.components[i] = tileComponent;
                }
            }
        }
        function getBlocksDimensions(context, component, r) {
            var codOrCoc = component.codingStyleParameters;
            var result = {};
            if (!codOrCoc.entropyCoderWithCustomPrecincts) {
                result.PPx = 15;
                result.PPy = 15;
            } else {
                result.PPx = codOrCoc.precinctsSizes[r].PPx;
                result.PPy = codOrCoc.precinctsSizes[r].PPy;
            }
            result.xcb_ = r > 0 ? Math.min(codOrCoc.xcb, result.PPx - 1) : Math.min(codOrCoc.xcb, result.PPx);
            result.ycb_ = r > 0 ? Math.min(codOrCoc.ycb, result.PPy - 1) : Math.min(codOrCoc.ycb, result.PPy);
            return result;
        }
        function buildPrecincts(context, resolution, dimensions) {
            var precinctWidth = 1 << dimensions.PPx;
            var precinctHeight = 1 << dimensions.PPy;
            var isZeroRes = resolution.resLevel === 0;
            var precinctWidthInSubband = 1 << dimensions.PPx + (isZeroRes ? 0 : -1);
            var precinctHeightInSubband = 1 << dimensions.PPy + (isZeroRes ? 0 : -1);
            var numprecinctswide = resolution.trx1 > resolution.trx0 ? Math.ceil(resolution.trx1 / precinctWidth) - Math.floor(resolution.trx0 / precinctWidth) : 0;
            var numprecinctshigh = resolution.try1 > resolution.try0 ? Math.ceil(resolution.try1 / precinctHeight) - Math.floor(resolution.try0 / precinctHeight) : 0;
            var numprecincts = numprecinctswide * numprecinctshigh;
            resolution.precinctParameters = {
                precinctWidth,
                precinctHeight,
                numprecinctswide,
                numprecinctshigh,
                numprecincts,
                precinctWidthInSubband,
                precinctHeightInSubband
            };
        }
        function buildCodeblocks(context, subband, dimensions) {
            var xcb_ = dimensions.xcb_;
            var ycb_ = dimensions.ycb_;
            var codeblockWidth = 1 << xcb_;
            var codeblockHeight = 1 << ycb_;
            var cbx0 = subband.tbx0 >> xcb_;
            var cby0 = subband.tby0 >> ycb_;
            var cbx1 = subband.tbx1 + codeblockWidth - 1 >> xcb_;
            var cby1 = subband.tby1 + codeblockHeight - 1 >> ycb_;
            var precinctParameters = subband.resolution.precinctParameters;
            var codeblocks = [];
            var precincts = [];
            var i, j, codeblock, precinctNumber;
            for (j = cby0; j < cby1; j++) {
                for (i = cbx0; i < cbx1; i++) {
                    codeblock = {
                        cbx: i,
                        cby: j,
                        tbx0: codeblockWidth * i,
                        tby0: codeblockHeight * j,
                        tbx1: codeblockWidth * (i + 1),
                        tby1: codeblockHeight * (j + 1)
                    };
                    codeblock.tbx0_ = Math.max(subband.tbx0, codeblock.tbx0);
                    codeblock.tby0_ = Math.max(subband.tby0, codeblock.tby0);
                    codeblock.tbx1_ = Math.min(subband.tbx1, codeblock.tbx1);
                    codeblock.tby1_ = Math.min(subband.tby1, codeblock.tby1);
                    var pi = Math.floor((codeblock.tbx0_ - subband.tbx0) / precinctParameters.precinctWidthInSubband);
                    var pj = Math.floor((codeblock.tby0_ - subband.tby0) / precinctParameters.precinctHeightInSubband);
                    precinctNumber = pi + pj * precinctParameters.numprecinctswide;
                    codeblock.precinctNumber = precinctNumber;
                    codeblock.subbandType = subband.type;
                    codeblock.Lblock = 3;
                    if (codeblock.tbx1_ <= codeblock.tbx0_ || codeblock.tby1_ <= codeblock.tby0_) {
                        continue;
                    }
                    codeblocks.push(codeblock);
                    var precinct = precincts[precinctNumber];
                    if (precinct !== undefined) {
                        if (i < precinct.cbxMin) {
                            precinct.cbxMin = i;
                        } else if (i > precinct.cbxMax) {
                            precinct.cbxMax = i;
                        }
                        if (j < precinct.cbyMin) {
                            precinct.cbxMin = j;
                        } else if (j > precinct.cbyMax) {
                            precinct.cbyMax = j;
                        }
                    } else {
                        precincts[precinctNumber] = precinct = {
                            cbxMin: i,
                            cbyMin: j,
                            cbxMax: i,
                            cbyMax: j
                        };
                    }
                    codeblock.precinct = precinct;
                }
            }
            subband.codeblockParameters = {
                codeblockWidth: xcb_,
                codeblockHeight: ycb_,
                numcodeblockwide: cbx1 - cbx0 + 1,
                numcodeblockhigh: cby1 - cby0 + 1
            };
            subband.codeblocks = codeblocks;
            subband.precincts = precincts;
        }
        function createPacket(resolution, precinctNumber, layerNumber) {
            var precinctCodeblocks = [];
            var subbands = resolution.subbands;
            for (var i = 0, ii = subbands.length; i < ii; i++) {
                var subband = subbands[i];
                var codeblocks = subband.codeblocks;
                for (var j = 0, jj = codeblocks.length; j < jj; j++) {
                    var codeblock = codeblocks[j];
                    if (codeblock.precinctNumber !== precinctNumber) {
                        continue;
                    }
                    precinctCodeblocks.push(codeblock);
                }
            }
            return {
                layerNumber,
                codeblocks: precinctCodeblocks
            };
        }
        function LayerResolutionComponentPositionIterator(context) {
            var siz = context.SIZ;
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var layersCount = tile.codingStyleDefaultParameters.layersCount;
            var componentsCount = siz.Csiz;
            var maxDecompositionLevelsCount = 0;
            for (var q = 0; q < componentsCount; q++) {
                maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
            }
            var l = 0, r = 0, i = 0, k = 0;
            this.nextPacket = function JpxImage_nextPacket() {
                for (; l < layersCount; l++) {
                    for (; r <= maxDecompositionLevelsCount; r++) {
                        for (; i < componentsCount; i++) {
                            var component = tile.components[i];
                            if (r > component.codingStyleParameters.decompositionLevelsCount) {
                                continue;
                            }
                            var resolution = component.resolutions[r];
                            var numprecincts = resolution.precinctParameters.numprecincts;
                            for (; k < numprecincts;) {
                                var packet = createPacket(resolution, k, l);
                                k++;
                                return packet;
                            }
                            k = 0;
                        }
                        i = 0;
                    }
                    r = 0;
                }
                throw new JpxError('Out of packets');
            };
        }
        function ResolutionLayerComponentPositionIterator(context) {
            var siz = context.SIZ;
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var layersCount = tile.codingStyleDefaultParameters.layersCount;
            var componentsCount = siz.Csiz;
            var maxDecompositionLevelsCount = 0;
            for (var q = 0; q < componentsCount; q++) {
                maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
            }
            var r = 0, l = 0, i = 0, k = 0;
            this.nextPacket = function JpxImage_nextPacket() {
                for (; r <= maxDecompositionLevelsCount; r++) {
                    for (; l < layersCount; l++) {
                        for (; i < componentsCount; i++) {
                            var component = tile.components[i];
                            if (r > component.codingStyleParameters.decompositionLevelsCount) {
                                continue;
                            }
                            var resolution = component.resolutions[r];
                            var numprecincts = resolution.precinctParameters.numprecincts;
                            for (; k < numprecincts;) {
                                var packet = createPacket(resolution, k, l);
                                k++;
                                return packet;
                            }
                            k = 0;
                        }
                        i = 0;
                    }
                    l = 0;
                }
                throw new JpxError('Out of packets');
            };
        }
        function ResolutionPositionComponentLayerIterator(context) {
            var siz = context.SIZ;
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var layersCount = tile.codingStyleDefaultParameters.layersCount;
            var componentsCount = siz.Csiz;
            var l, r, c, p;
            var maxDecompositionLevelsCount = 0;
            for (c = 0; c < componentsCount; c++) {
                const component = tile.components[c];
                maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, component.codingStyleParameters.decompositionLevelsCount);
            }
            var maxNumPrecinctsInLevel = new Int32Array(maxDecompositionLevelsCount + 1);
            for (r = 0; r <= maxDecompositionLevelsCount; ++r) {
                var maxNumPrecincts = 0;
                for (c = 0; c < componentsCount; ++c) {
                    var resolutions = tile.components[c].resolutions;
                    if (r < resolutions.length) {
                        maxNumPrecincts = Math.max(maxNumPrecincts, resolutions[r].precinctParameters.numprecincts);
                    }
                }
                maxNumPrecinctsInLevel[r] = maxNumPrecincts;
            }
            l = 0;
            r = 0;
            c = 0;
            p = 0;
            this.nextPacket = function JpxImage_nextPacket() {
                for (; r <= maxDecompositionLevelsCount; r++) {
                    for (; p < maxNumPrecinctsInLevel[r]; p++) {
                        for (; c < componentsCount; c++) {
                            const component = tile.components[c];
                            if (r > component.codingStyleParameters.decompositionLevelsCount) {
                                continue;
                            }
                            var resolution = component.resolutions[r];
                            var numprecincts = resolution.precinctParameters.numprecincts;
                            if (p >= numprecincts) {
                                continue;
                            }
                            for (; l < layersCount;) {
                                var packet = createPacket(resolution, p, l);
                                l++;
                                return packet;
                            }
                            l = 0;
                        }
                        c = 0;
                    }
                    p = 0;
                }
                throw new JpxError('Out of packets');
            };
        }
        function PositionComponentResolutionLayerIterator(context) {
            var siz = context.SIZ;
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var layersCount = tile.codingStyleDefaultParameters.layersCount;
            var componentsCount = siz.Csiz;
            var precinctsSizes = getPrecinctSizesInImageScale(tile);
            var precinctsIterationSizes = precinctsSizes;
            var l = 0, r = 0, c = 0, px = 0, py = 0;
            this.nextPacket = function JpxImage_nextPacket() {
                for (; py < precinctsIterationSizes.maxNumHigh; py++) {
                    for (; px < precinctsIterationSizes.maxNumWide; px++) {
                        for (; c < componentsCount; c++) {
                            var component = tile.components[c];
                            var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
                            for (; r <= decompositionLevelsCount; r++) {
                                var resolution = component.resolutions[r];
                                var sizeInImageScale = precinctsSizes.components[c].resolutions[r];
                                var k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
                                if (k === null) {
                                    continue;
                                }
                                for (; l < layersCount;) {
                                    var packet = createPacket(resolution, k, l);
                                    l++;
                                    return packet;
                                }
                                l = 0;
                            }
                            r = 0;
                        }
                        c = 0;
                    }
                    px = 0;
                }
                throw new JpxError('Out of packets');
            };
        }
        function ComponentPositionResolutionLayerIterator(context) {
            var siz = context.SIZ;
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var layersCount = tile.codingStyleDefaultParameters.layersCount;
            var componentsCount = siz.Csiz;
            var precinctsSizes = getPrecinctSizesInImageScale(tile);
            var l = 0, r = 0, c = 0, px = 0, py = 0;
            this.nextPacket = function JpxImage_nextPacket() {
                for (; c < componentsCount; ++c) {
                    var component = tile.components[c];
                    var precinctsIterationSizes = precinctsSizes.components[c];
                    var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
                    for (; py < precinctsIterationSizes.maxNumHigh; py++) {
                        for (; px < precinctsIterationSizes.maxNumWide; px++) {
                            for (; r <= decompositionLevelsCount; r++) {
                                var resolution = component.resolutions[r];
                                var sizeInImageScale = precinctsIterationSizes.resolutions[r];
                                var k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
                                if (k === null) {
                                    continue;
                                }
                                for (; l < layersCount;) {
                                    var packet = createPacket(resolution, k, l);
                                    l++;
                                    return packet;
                                }
                                l = 0;
                            }
                            r = 0;
                        }
                        px = 0;
                    }
                    py = 0;
                }
                throw new JpxError('Out of packets');
            };
        }
        function getPrecinctIndexIfExist(pxIndex, pyIndex, sizeInImageScale, precinctIterationSizes, resolution) {
            var posX = pxIndex * precinctIterationSizes.minWidth;
            var posY = pyIndex * precinctIterationSizes.minHeight;
            if (posX % sizeInImageScale.width !== 0 || posY % sizeInImageScale.height !== 0) {
                return null;
            }
            var startPrecinctRowIndex = posY / sizeInImageScale.width * resolution.precinctParameters.numprecinctswide;
            return posX / sizeInImageScale.height + startPrecinctRowIndex;
        }
        function getPrecinctSizesInImageScale(tile) {
            var componentsCount = tile.components.length;
            var minWidth = Number.MAX_VALUE;
            var minHeight = Number.MAX_VALUE;
            var maxNumWide = 0;
            var maxNumHigh = 0;
            var sizePerComponent = new Array(componentsCount);
            for (var c = 0; c < componentsCount; c++) {
                var component = tile.components[c];
                var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
                var sizePerResolution = new Array(decompositionLevelsCount + 1);
                var minWidthCurrentComponent = Number.MAX_VALUE;
                var minHeightCurrentComponent = Number.MAX_VALUE;
                var maxNumWideCurrentComponent = 0;
                var maxNumHighCurrentComponent = 0;
                var scale = 1;
                for (var r = decompositionLevelsCount; r >= 0; --r) {
                    var resolution = component.resolutions[r];
                    var widthCurrentResolution = scale * resolution.precinctParameters.precinctWidth;
                    var heightCurrentResolution = scale * resolution.precinctParameters.precinctHeight;
                    minWidthCurrentComponent = Math.min(minWidthCurrentComponent, widthCurrentResolution);
                    minHeightCurrentComponent = Math.min(minHeightCurrentComponent, heightCurrentResolution);
                    maxNumWideCurrentComponent = Math.max(maxNumWideCurrentComponent, resolution.precinctParameters.numprecinctswide);
                    maxNumHighCurrentComponent = Math.max(maxNumHighCurrentComponent, resolution.precinctParameters.numprecinctshigh);
                    sizePerResolution[r] = {
                        width: widthCurrentResolution,
                        height: heightCurrentResolution
                    };
                    scale <<= 1;
                }
                minWidth = Math.min(minWidth, minWidthCurrentComponent);
                minHeight = Math.min(minHeight, minHeightCurrentComponent);
                maxNumWide = Math.max(maxNumWide, maxNumWideCurrentComponent);
                maxNumHigh = Math.max(maxNumHigh, maxNumHighCurrentComponent);
                sizePerComponent[c] = {
                    resolutions: sizePerResolution,
                    minWidth: minWidthCurrentComponent,
                    minHeight: minHeightCurrentComponent,
                    maxNumWide: maxNumWideCurrentComponent,
                    maxNumHigh: maxNumHighCurrentComponent
                };
            }
            return {
                components: sizePerComponent,
                minWidth,
                minHeight,
                maxNumWide,
                maxNumHigh
            };
        }
        function buildPackets(context) {
            var siz = context.SIZ;
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var componentsCount = siz.Csiz;
            for (var c = 0; c < componentsCount; c++) {
                var component = tile.components[c];
                var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
                var resolutions = [];
                var subbands = [];
                for (var r = 0; r <= decompositionLevelsCount; r++) {
                    var blocksDimensions = getBlocksDimensions(context, component, r);
                    var resolution = {};
                    var scale = 1 << decompositionLevelsCount - r;
                    resolution.trx0 = Math.ceil(component.tcx0 / scale);
                    resolution.try0 = Math.ceil(component.tcy0 / scale);
                    resolution.trx1 = Math.ceil(component.tcx1 / scale);
                    resolution.try1 = Math.ceil(component.tcy1 / scale);
                    resolution.resLevel = r;
                    buildPrecincts(context, resolution, blocksDimensions);
                    resolutions.push(resolution);
                    var subband;
                    if (r === 0) {
                        subband = {};
                        subband.type = 'LL';
                        subband.tbx0 = Math.ceil(component.tcx0 / scale);
                        subband.tby0 = Math.ceil(component.tcy0 / scale);
                        subband.tbx1 = Math.ceil(component.tcx1 / scale);
                        subband.tby1 = Math.ceil(component.tcy1 / scale);
                        subband.resolution = resolution;
                        buildCodeblocks(context, subband, blocksDimensions);
                        subbands.push(subband);
                        resolution.subbands = [subband];
                    } else {
                        var bscale = 1 << decompositionLevelsCount - r + 1;
                        var resolutionSubbands = [];
                        subband = {};
                        subband.type = 'HL';
                        subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
                        subband.tby0 = Math.ceil(component.tcy0 / bscale);
                        subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
                        subband.tby1 = Math.ceil(component.tcy1 / bscale);
                        subband.resolution = resolution;
                        buildCodeblocks(context, subband, blocksDimensions);
                        subbands.push(subband);
                        resolutionSubbands.push(subband);
                        subband = {};
                        subband.type = 'LH';
                        subband.tbx0 = Math.ceil(component.tcx0 / bscale);
                        subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
                        subband.tbx1 = Math.ceil(component.tcx1 / bscale);
                        subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
                        subband.resolution = resolution;
                        buildCodeblocks(context, subband, blocksDimensions);
                        subbands.push(subband);
                        resolutionSubbands.push(subband);
                        subband = {};
                        subband.type = 'HH';
                        subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
                        subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
                        subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
                        subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
                        subband.resolution = resolution;
                        buildCodeblocks(context, subband, blocksDimensions);
                        subbands.push(subband);
                        resolutionSubbands.push(subband);
                        resolution.subbands = resolutionSubbands;
                    }
                }
                component.resolutions = resolutions;
                component.subbands = subbands;
            }
            var progressionOrder = tile.codingStyleDefaultParameters.progressionOrder;
            switch (progressionOrder) {
            case 0:
                tile.packetsIterator = new LayerResolutionComponentPositionIterator(context);
                break;
            case 1:
                tile.packetsIterator = new ResolutionLayerComponentPositionIterator(context);
                break;
            case 2:
                tile.packetsIterator = new ResolutionPositionComponentLayerIterator(context);
                break;
            case 3:
                tile.packetsIterator = new PositionComponentResolutionLayerIterator(context);
                break;
            case 4:
                tile.packetsIterator = new ComponentPositionResolutionLayerIterator(context);
                break;
            default:
                throw new JpxError(`Unsupported progression order ${ progressionOrder }`);
            }
        }
        function parseTilePackets(context, data, offset, dataLength) {
            var position = 0;
            var buffer, bufferSize = 0, skipNextBit = false;
            function readBits(count) {
                while (bufferSize < count) {
                    var b = data[offset + position];
                    position++;
                    if (skipNextBit) {
                        buffer = buffer << 7 | b;
                        bufferSize += 7;
                        skipNextBit = false;
                    } else {
                        buffer = buffer << 8 | b;
                        bufferSize += 8;
                    }
                    if (b === 255) {
                        skipNextBit = true;
                    }
                }
                bufferSize -= count;
                return buffer >>> bufferSize & (1 << count) - 1;
            }
            function skipMarkerIfEqual(value) {
                if (data[offset + position - 1] === 255 && data[offset + position] === value) {
                    skipBytes(1);
                    return true;
                } else if (data[offset + position] === 255 && data[offset + position + 1] === value) {
                    skipBytes(2);
                    return true;
                }
                return false;
            }
            function skipBytes(count) {
                position += count;
            }
            function alignToByte() {
                bufferSize = 0;
                if (skipNextBit) {
                    position++;
                    skipNextBit = false;
                }
            }
            function readCodingpasses() {
                if (readBits(1) === 0) {
                    return 1;
                }
                if (readBits(1) === 0) {
                    return 2;
                }
                var value = readBits(2);
                if (value < 3) {
                    return value + 3;
                }
                value = readBits(5);
                if (value < 31) {
                    return value + 6;
                }
                value = readBits(7);
                return value + 37;
            }
            var tileIndex = context.currentTile.index;
            var tile = context.tiles[tileIndex];
            var sopMarkerUsed = context.COD.sopMarkerUsed;
            var ephMarkerUsed = context.COD.ephMarkerUsed;
            var packetsIterator = tile.packetsIterator;
            while (position < dataLength) {
                alignToByte();
                if (sopMarkerUsed && skipMarkerIfEqual(145)) {
                    skipBytes(4);
                }
                var packet = packetsIterator.nextPacket();
                if (!readBits(1)) {
                    continue;
                }
                var layerNumber = packet.layerNumber;
                var queue = [], codeblock;
                for (var i = 0, ii = packet.codeblocks.length; i < ii; i++) {
                    codeblock = packet.codeblocks[i];
                    var precinct = codeblock.precinct;
                    var codeblockColumn = codeblock.cbx - precinct.cbxMin;
                    var codeblockRow = codeblock.cby - precinct.cbyMin;
                    var codeblockIncluded = false;
                    var firstTimeInclusion = false;
                    var valueReady;
                    if (codeblock.included !== undefined) {
                        codeblockIncluded = !!readBits(1);
                    } else {
                        precinct = codeblock.precinct;
                        var inclusionTree, zeroBitPlanesTree;
                        if (precinct.inclusionTree !== undefined) {
                            inclusionTree = precinct.inclusionTree;
                        } else {
                            var width = precinct.cbxMax - precinct.cbxMin + 1;
                            var height = precinct.cbyMax - precinct.cbyMin + 1;
                            inclusionTree = new InclusionTree(width, height, layerNumber);
                            zeroBitPlanesTree = new TagTree(width, height);
                            precinct.inclusionTree = inclusionTree;
                            precinct.zeroBitPlanesTree = zeroBitPlanesTree;
                        }
                        if (inclusionTree.reset(codeblockColumn, codeblockRow, layerNumber)) {
                            while (true) {
                                if (readBits(1)) {
                                    valueReady = !inclusionTree.nextLevel();
                                    if (valueReady) {
                                        codeblock.included = true;
                                        codeblockIncluded = firstTimeInclusion = true;
                                        break;
                                    }
                                } else {
                                    inclusionTree.incrementValue(layerNumber);
                                    break;
                                }
                            }
                        }
                    }
                    if (!codeblockIncluded) {
                        continue;
                    }
                    if (firstTimeInclusion) {
                        zeroBitPlanesTree = precinct.zeroBitPlanesTree;
                        zeroBitPlanesTree.reset(codeblockColumn, codeblockRow);
                        while (true) {
                            if (readBits(1)) {
                                valueReady = !zeroBitPlanesTree.nextLevel();
                                if (valueReady) {
                                    break;
                                }
                            } else {
                                zeroBitPlanesTree.incrementValue();
                            }
                        }
                        codeblock.zeroBitPlanes = zeroBitPlanesTree.value;
                    }
                    var codingpasses = readCodingpasses();
                    while (readBits(1)) {
                        codeblock.Lblock++;
                    }
                    var codingpassesLog2 = b.log2(codingpasses);
                    var bits = (codingpasses < 1 << codingpassesLog2 ? codingpassesLog2 - 1 : codingpassesLog2) + codeblock.Lblock;
                    var codedDataLength = readBits(bits);
                    queue.push({
                        codeblock,
                        codingpasses,
                        dataLength: codedDataLength
                    });
                }
                alignToByte();
                if (ephMarkerUsed) {
                    skipMarkerIfEqual(146);
                }
                while (queue.length > 0) {
                    var packetItem = queue.shift();
                    codeblock = packetItem.codeblock;
                    if (codeblock.data === undefined) {
                        codeblock.data = [];
                    }
                    codeblock.data.push({
                        data,
                        start: offset + position,
                        end: offset + position + packetItem.dataLength,
                        codingpasses: packetItem.codingpasses
                    });
                    position += packetItem.dataLength;
                }
            }
            return position;
        }
        function copyCoefficients(coefficients, levelWidth, levelHeight, subband, delta, mb, reversible, segmentationSymbolUsed) {
            var x0 = subband.tbx0;
            var y0 = subband.tby0;
            var width = subband.tbx1 - subband.tbx0;
            var codeblocks = subband.codeblocks;
            var right = subband.type.charAt(0) === 'H' ? 1 : 0;
            var bottom = subband.type.charAt(1) === 'H' ? levelWidth : 0;
            for (var i = 0, ii = codeblocks.length; i < ii; ++i) {
                var codeblock = codeblocks[i];
                var blockWidth = codeblock.tbx1_ - codeblock.tbx0_;
                var blockHeight = codeblock.tby1_ - codeblock.tby0_;
                if (blockWidth === 0 || blockHeight === 0) {
                    continue;
                }
                if (codeblock.data === undefined) {
                    continue;
                }
                var bitModel, currentCodingpassType;
                bitModel = new BitModel(blockWidth, blockHeight, codeblock.subbandType, codeblock.zeroBitPlanes, mb);
                currentCodingpassType = 2;
                var data = codeblock.data, totalLength = 0, codingpasses = 0;
                var j, jj, dataItem;
                for (j = 0, jj = data.length; j < jj; j++) {
                    dataItem = data[j];
                    totalLength += dataItem.end - dataItem.start;
                    codingpasses += dataItem.codingpasses;
                }
                var encodedData = new Uint8Array(totalLength);
                var position = 0;
                for (j = 0, jj = data.length; j < jj; j++) {
                    dataItem = data[j];
                    var chunk = dataItem.data.subarray(dataItem.start, dataItem.end);
                    encodedData.set(chunk, position);
                    position += chunk.length;
                }
                var decoder = new c.ArithmeticDecoder(encodedData, 0, totalLength);
                bitModel.setDecoder(decoder);
                for (j = 0; j < codingpasses; j++) {
                    switch (currentCodingpassType) {
                    case 0:
                        bitModel.runSignificancePropagationPass();
                        break;
                    case 1:
                        bitModel.runMagnitudeRefinementPass();
                        break;
                    case 2:
                        bitModel.runCleanupPass();
                        if (segmentationSymbolUsed) {
                            bitModel.checkSegmentationSymbol();
                        }
                        break;
                    }
                    currentCodingpassType = (currentCodingpassType + 1) % 3;
                }
                var offset = codeblock.tbx0_ - x0 + (codeblock.tby0_ - y0) * width;
                var sign = bitModel.coefficentsSign;
                var magnitude = bitModel.coefficentsMagnitude;
                var bitsDecoded = bitModel.bitsDecoded;
                var magnitudeCorrection = reversible ? 0 : 0.5;
                var k, n, nb;
                position = 0;
                var interleave = subband.type !== 'LL';
                for (j = 0; j < blockHeight; j++) {
                    var row = offset / width | 0;
                    var levelOffset = 2 * row * (levelWidth - width) + right + bottom;
                    for (k = 0; k < blockWidth; k++) {
                        n = magnitude[position];
                        if (n !== 0) {
                            n = (n + magnitudeCorrection) * delta;
                            if (sign[position] !== 0) {
                                n = -n;
                            }
                            nb = bitsDecoded[position];
                            var pos = interleave ? levelOffset + (offset << 1) : offset;
                            if (reversible && nb >= mb) {
                                coefficients[pos] = n;
                            } else {
                                coefficients[pos] = n * (1 << mb - nb);
                            }
                        }
                        offset++;
                        position++;
                    }
                    offset += width - blockWidth;
                }
            }
        }
        function transformTile(context, tile, c) {
            var component = tile.components[c];
            var codingStyleParameters = component.codingStyleParameters;
            var quantizationParameters = component.quantizationParameters;
            var decompositionLevelsCount = codingStyleParameters.decompositionLevelsCount;
            var spqcds = quantizationParameters.SPqcds;
            var scalarExpounded = quantizationParameters.scalarExpounded;
            var guardBits = quantizationParameters.guardBits;
            var segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
            var precision = context.components[c].precision;
            var reversible = codingStyleParameters.reversibleTransformation;
            var transform = reversible ? new ReversibleTransform() : new IrreversibleTransform();
            var subbandCoefficients = [];
            var b = 0;
            for (var i = 0; i <= decompositionLevelsCount; i++) {
                var resolution = component.resolutions[i];
                var width = resolution.trx1 - resolution.trx0;
                var height = resolution.try1 - resolution.try0;
                var coefficients = new Float32Array(width * height);
                for (var j = 0, jj = resolution.subbands.length; j < jj; j++) {
                    var mu, epsilon;
                    if (!scalarExpounded) {
                        mu = spqcds[0].mu;
                        epsilon = spqcds[0].epsilon + (i > 0 ? 1 - i : 0);
                    } else {
                        mu = spqcds[b].mu;
                        epsilon = spqcds[b].epsilon;
                        b++;
                    }
                    var subband = resolution.subbands[j];
                    var gainLog2 = SubbandsGainLog2[subband.type];
                    var delta = reversible ? 1 : 2 ** (precision + gainLog2 - epsilon) * (1 + mu / 2048);
                    var mb = guardBits + epsilon - 1;
                    copyCoefficients(coefficients, width, height, subband, delta, mb, reversible, segmentationSymbolUsed);
                }
                subbandCoefficients.push({
                    width,
                    height,
                    items: coefficients
                });
            }
            var result = transform.calculate(subbandCoefficients, component.tcx0, component.tcy0);
            return {
                left: component.tcx0,
                top: component.tcy0,
                width: result.width,
                height: result.height,
                items: result.items
            };
        }
        function transformComponents(context) {
            var siz = context.SIZ;
            var components = context.components;
            var componentsCount = siz.Csiz;
            var resultImages = [];
            for (var i = 0, ii = context.tiles.length; i < ii; i++) {
                var tile = context.tiles[i];
                var transformedTiles = [];
                var c;
                for (c = 0; c < componentsCount; c++) {
                    transformedTiles[c] = transformTile(context, tile, c);
                }
                var tile0 = transformedTiles[0];
                var out = new Uint8ClampedArray(tile0.items.length * componentsCount);
                var result = {
                    left: tile0.left,
                    top: tile0.top,
                    width: tile0.width,
                    height: tile0.height,
                    items: out
                };
                var shift, offset;
                var pos = 0, j, jj, y0, y1, y2;
                if (tile.codingStyleDefaultParameters.multipleComponentTransform) {
                    var fourComponents = componentsCount === 4;
                    var y0items = transformedTiles[0].items;
                    var y1items = transformedTiles[1].items;
                    var y2items = transformedTiles[2].items;
                    var y3items = fourComponents ? transformedTiles[3].items : null;
                    shift = components[0].precision - 8;
                    offset = (128 << shift) + 0.5;
                    var component0 = tile.components[0];
                    var alpha01 = componentsCount - 3;
                    jj = y0items.length;
                    if (!component0.codingStyleParameters.reversibleTransformation) {
                        for (j = 0; j < jj; j++, pos += alpha01) {
                            y0 = y0items[j] + offset;
                            y1 = y1items[j];
                            y2 = y2items[j];
                            out[pos++] = y0 + 1.402 * y2 >> shift;
                            out[pos++] = y0 - 0.34413 * y1 - 0.71414 * y2 >> shift;
                            out[pos++] = y0 + 1.772 * y1 >> shift;
                        }
                    } else {
                        for (j = 0; j < jj; j++, pos += alpha01) {
                            y0 = y0items[j] + offset;
                            y1 = y1items[j];
                            y2 = y2items[j];
                            const g = y0 - (y2 + y1 >> 2);
                            out[pos++] = g + y2 >> shift;
                            out[pos++] = g >> shift;
                            out[pos++] = g + y1 >> shift;
                        }
                    }
                    if (fourComponents) {
                        for (j = 0, pos = 3; j < jj; j++, pos += 4) {
                            out[pos] = y3items[j] + offset >> shift;
                        }
                    }
                } else {
                    for (c = 0; c < componentsCount; c++) {
                        var items = transformedTiles[c].items;
                        shift = components[c].precision - 8;
                        offset = (128 << shift) + 0.5;
                        for (pos = c, j = 0, jj = items.length; j < jj; j++) {
                            out[pos] = items[j] + offset >> shift;
                            pos += componentsCount;
                        }
                    }
                }
                resultImages.push(result);
            }
            return resultImages;
        }
        function initializeTile(context, tileIndex) {
            var siz = context.SIZ;
            var componentsCount = siz.Csiz;
            var tile = context.tiles[tileIndex];
            for (var c = 0; c < componentsCount; c++) {
                var component = tile.components[c];
                var qcdOrQcc = context.currentTile.QCC[c] !== undefined ? context.currentTile.QCC[c] : context.currentTile.QCD;
                component.quantizationParameters = qcdOrQcc;
                var codOrCoc = context.currentTile.COC[c] !== undefined ? context.currentTile.COC[c] : context.currentTile.COD;
                component.codingStyleParameters = codOrCoc;
            }
            tile.codingStyleDefaultParameters = context.currentTile.COD;
        }
        var TagTree = function TagTreeClosure() {
            function TagTree(width, height) {
                var levelsLength = b.log2(Math.max(width, height)) + 1;
                this.levels = [];
                for (var i = 0; i < levelsLength; i++) {
                    var level = {
                        width,
                        height,
                        items: []
                    };
                    this.levels.push(level);
                    width = Math.ceil(width / 2);
                    height = Math.ceil(height / 2);
                }
            }
            TagTree.prototype = {
                reset: function TagTree_reset(i, j) {
                    var currentLevel = 0, value = 0, level;
                    while (currentLevel < this.levels.length) {
                        level = this.levels[currentLevel];
                        var index = i + j * level.width;
                        if (level.items[index] !== undefined) {
                            value = level.items[index];
                            break;
                        }
                        level.index = index;
                        i >>= 1;
                        j >>= 1;
                        currentLevel++;
                    }
                    currentLevel--;
                    level = this.levels[currentLevel];
                    level.items[level.index] = value;
                    this.currentLevel = currentLevel;
                    delete this.value;
                },
                incrementValue: function TagTree_incrementValue() {
                    var level = this.levels[this.currentLevel];
                    level.items[level.index]++;
                },
                nextLevel: function TagTree_nextLevel() {
                    var currentLevel = this.currentLevel;
                    var level = this.levels[currentLevel];
                    var value = level.items[level.index];
                    currentLevel--;
                    if (currentLevel < 0) {
                        this.value = value;
                        return false;
                    }
                    this.currentLevel = currentLevel;
                    level = this.levels[currentLevel];
                    level.items[level.index] = value;
                    return true;
                }
            };
            return TagTree;
        }();
        var InclusionTree = function InclusionTreeClosure() {
            function InclusionTree(width, height, defaultValue) {
                var levelsLength = b.log2(Math.max(width, height)) + 1;
                this.levels = [];
                for (var i = 0; i < levelsLength; i++) {
                    var items = new Uint8Array(width * height);
                    for (var j = 0, jj = items.length; j < jj; j++) {
                        items[j] = defaultValue;
                    }
                    var level = {
                        width,
                        height,
                        items
                    };
                    this.levels.push(level);
                    width = Math.ceil(width / 2);
                    height = Math.ceil(height / 2);
                }
            }
            InclusionTree.prototype = {
                reset: function InclusionTree_reset(i, j, stopValue) {
                    var currentLevel = 0;
                    while (currentLevel < this.levels.length) {
                        var level = this.levels[currentLevel];
                        var index = i + j * level.width;
                        level.index = index;
                        var value = level.items[index];
                        if (value === 255) {
                            break;
                        }
                        if (value > stopValue) {
                            this.currentLevel = currentLevel;
                            this.propagateValues();
                            return false;
                        }
                        i >>= 1;
                        j >>= 1;
                        currentLevel++;
                    }
                    this.currentLevel = currentLevel - 1;
                    return true;
                },
                incrementValue: function InclusionTree_incrementValue(stopValue) {
                    var level = this.levels[this.currentLevel];
                    level.items[level.index] = stopValue + 1;
                    this.propagateValues();
                },
                propagateValues: function InclusionTree_propagateValues() {
                    var levelIndex = this.currentLevel;
                    var level = this.levels[levelIndex];
                    var currentValue = level.items[level.index];
                    while (--levelIndex >= 0) {
                        level = this.levels[levelIndex];
                        level.items[level.index] = currentValue;
                    }
                },
                nextLevel: function InclusionTree_nextLevel() {
                    var currentLevel = this.currentLevel;
                    var level = this.levels[currentLevel];
                    var value = level.items[level.index];
                    level.items[level.index] = 255;
                    currentLevel--;
                    if (currentLevel < 0) {
                        return false;
                    }
                    this.currentLevel = currentLevel;
                    level = this.levels[currentLevel];
                    level.items[level.index] = value;
                    return true;
                }
            };
            return InclusionTree;
        }();
        var BitModel = function BitModelClosure() {
            var UNIFORM_CONTEXT = 17;
            var RUNLENGTH_CONTEXT = 18;
            var LLAndLHContextsLabel = new Uint8Array([
                0,
                5,
                8,
                0,
                3,
                7,
                8,
                0,
                4,
                7,
                8,
                0,
                0,
                0,
                0,
                0,
                1,
                6,
                8,
                0,
                3,
                7,
                8,
                0,
                4,
                7,
                8,
                0,
                0,
                0,
                0,
                0,
                2,
                6,
                8,
                0,
                3,
                7,
                8,
                0,
                4,
                7,
                8,
                0,
                0,
                0,
                0,
                0,
                2,
                6,
                8,
                0,
                3,
                7,
                8,
                0,
                4,
                7,
                8,
                0,
                0,
                0,
                0,
                0,
                2,
                6,
                8,
                0,
                3,
                7,
                8,
                0,
                4,
                7,
                8
            ]);
            var HLContextLabel = new Uint8Array([
                0,
                3,
                4,
                0,
                5,
                7,
                7,
                0,
                8,
                8,
                8,
                0,
                0,
                0,
                0,
                0,
                1,
                3,
                4,
                0,
                6,
                7,
                7,
                0,
                8,
                8,
                8,
                0,
                0,
                0,
                0,
                0,
                2,
                3,
                4,
                0,
                6,
                7,
                7,
                0,
                8,
                8,
                8,
                0,
                0,
                0,
                0,
                0,
                2,
                3,
                4,
                0,
                6,
                7,
                7,
                0,
                8,
                8,
                8,
                0,
                0,
                0,
                0,
                0,
                2,
                3,
                4,
                0,
                6,
                7,
                7,
                0,
                8,
                8,
                8
            ]);
            var HHContextLabel = new Uint8Array([
                0,
                1,
                2,
                0,
                1,
                2,
                2,
                0,
                2,
                2,
                2,
                0,
                0,
                0,
                0,
                0,
                3,
                4,
                5,
                0,
                4,
                5,
                5,
                0,
                5,
                5,
                5,
                0,
                0,
                0,
                0,
                0,
                6,
                7,
                7,
                0,
                7,
                7,
                7,
                0,
                7,
                7,
                7,
                0,
                0,
                0,
                0,
                0,
                8,
                8,
                8,
                0,
                8,
                8,
                8,
                0,
                8,
                8,
                8,
                0,
                0,
                0,
                0,
                0,
                8,
                8,
                8,
                0,
                8,
                8,
                8,
                0,
                8,
                8,
                8
            ]);
            function BitModel(width, height, subband, zeroBitPlanes, mb) {
                this.width = width;
                this.height = height;
                let contextLabelTable;
                if (subband === 'HH') {
                    contextLabelTable = HHContextLabel;
                } else if (subband === 'HL') {
                    contextLabelTable = HLContextLabel;
                } else {
                    contextLabelTable = LLAndLHContextsLabel;
                }
                this.contextLabelTable = contextLabelTable;
                var coefficientCount = width * height;
                this.neighborsSignificance = new Uint8Array(coefficientCount);
                this.coefficentsSign = new Uint8Array(coefficientCount);
                let coefficentsMagnitude;
                if (mb > 14) {
                    coefficentsMagnitude = new Uint32Array(coefficientCount);
                } else if (mb > 6) {
                    coefficentsMagnitude = new Uint16Array(coefficientCount);
                } else {
                    coefficentsMagnitude = new Uint8Array(coefficientCount);
                }
                this.coefficentsMagnitude = coefficentsMagnitude;
                this.processingFlags = new Uint8Array(coefficientCount);
                var bitsDecoded = new Uint8Array(coefficientCount);
                if (zeroBitPlanes !== 0) {
                    for (var i = 0; i < coefficientCount; i++) {
                        bitsDecoded[i] = zeroBitPlanes;
                    }
                }
                this.bitsDecoded = bitsDecoded;
                this.reset();
            }
            BitModel.prototype = {
                setDecoder: function BitModel_setDecoder(decoder) {
                    this.decoder = decoder;
                },
                reset: function BitModel_reset() {
                    this.contexts = new Int8Array(19);
                    this.contexts[0] = 4 << 1 | 0;
                    this.contexts[UNIFORM_CONTEXT] = 46 << 1 | 0;
                    this.contexts[RUNLENGTH_CONTEXT] = 3 << 1 | 0;
                },
                setNeighborsSignificance: function BitModel_setNeighborsSignificance(row, column, index) {
                    var neighborsSignificance = this.neighborsSignificance;
                    var width = this.width, height = this.height;
                    var left = column > 0;
                    var right = column + 1 < width;
                    var i;
                    if (row > 0) {
                        i = index - width;
                        if (left) {
                            neighborsSignificance[i - 1] += 16;
                        }
                        if (right) {
                            neighborsSignificance[i + 1] += 16;
                        }
                        neighborsSignificance[i] += 4;
                    }
                    if (row + 1 < height) {
                        i = index + width;
                        if (left) {
                            neighborsSignificance[i - 1] += 16;
                        }
                        if (right) {
                            neighborsSignificance[i + 1] += 16;
                        }
                        neighborsSignificance[i] += 4;
                    }
                    if (left) {
                        neighborsSignificance[index - 1] += 1;
                    }
                    if (right) {
                        neighborsSignificance[index + 1] += 1;
                    }
                    neighborsSignificance[index] |= 128;
                },
                runSignificancePropagationPass: function BitModel_runSignificancePropagationPass() {
                    var decoder = this.decoder;
                    var width = this.width, height = this.height;
                    var coefficentsMagnitude = this.coefficentsMagnitude;
                    var coefficentsSign = this.coefficentsSign;
                    var neighborsSignificance = this.neighborsSignificance;
                    var processingFlags = this.processingFlags;
                    var contexts = this.contexts;
                    var labels = this.contextLabelTable;
                    var bitsDecoded = this.bitsDecoded;
                    var processedInverseMask = ~1;
                    var processedMask = 1;
                    var firstMagnitudeBitMask = 2;
                    for (var i0 = 0; i0 < height; i0 += 4) {
                        for (var j = 0; j < width; j++) {
                            var index = i0 * width + j;
                            for (var i1 = 0; i1 < 4; i1++, index += width) {
                                var i = i0 + i1;
                                if (i >= height) {
                                    break;
                                }
                                processingFlags[index] &= processedInverseMask;
                                if (coefficentsMagnitude[index] || !neighborsSignificance[index]) {
                                    continue;
                                }
                                var contextLabel = labels[neighborsSignificance[index]];
                                var decision = decoder.readBit(contexts, contextLabel);
                                if (decision) {
                                    var sign = this.decodeSignBit(i, j, index);
                                    coefficentsSign[index] = sign;
                                    coefficentsMagnitude[index] = 1;
                                    this.setNeighborsSignificance(i, j, index);
                                    processingFlags[index] |= firstMagnitudeBitMask;
                                }
                                bitsDecoded[index]++;
                                processingFlags[index] |= processedMask;
                            }
                        }
                    }
                },
                decodeSignBit: function BitModel_decodeSignBit(row, column, index) {
                    var width = this.width, height = this.height;
                    var coefficentsMagnitude = this.coefficentsMagnitude;
                    var coefficentsSign = this.coefficentsSign;
                    var contribution, sign0, sign1, significance1;
                    var contextLabel, decoded;
                    significance1 = column > 0 && coefficentsMagnitude[index - 1] !== 0;
                    if (column + 1 < width && coefficentsMagnitude[index + 1] !== 0) {
                        sign1 = coefficentsSign[index + 1];
                        if (significance1) {
                            sign0 = coefficentsSign[index - 1];
                            contribution = 1 - sign1 - sign0;
                        } else {
                            contribution = 1 - sign1 - sign1;
                        }
                    } else if (significance1) {
                        sign0 = coefficentsSign[index - 1];
                        contribution = 1 - sign0 - sign0;
                    } else {
                        contribution = 0;
                    }
                    var horizontalContribution = 3 * contribution;
                    significance1 = row > 0 && coefficentsMagnitude[index - width] !== 0;
                    if (row + 1 < height && coefficentsMagnitude[index + width] !== 0) {
                        sign1 = coefficentsSign[index + width];
                        if (significance1) {
                            sign0 = coefficentsSign[index - width];
                            contribution = 1 - sign1 - sign0 + horizontalContribution;
                        } else {
                            contribution = 1 - sign1 - sign1 + horizontalContribution;
                        }
                    } else if (significance1) {
                        sign0 = coefficentsSign[index - width];
                        contribution = 1 - sign0 - sign0 + horizontalContribution;
                    } else {
                        contribution = horizontalContribution;
                    }
                    if (contribution >= 0) {
                        contextLabel = 9 + contribution;
                        decoded = this.decoder.readBit(this.contexts, contextLabel);
                    } else {
                        contextLabel = 9 - contribution;
                        decoded = this.decoder.readBit(this.contexts, contextLabel) ^ 1;
                    }
                    return decoded;
                },
                runMagnitudeRefinementPass: function BitModel_runMagnitudeRefinementPass() {
                    var decoder = this.decoder;
                    var width = this.width, height = this.height;
                    var coefficentsMagnitude = this.coefficentsMagnitude;
                    var neighborsSignificance = this.neighborsSignificance;
                    var contexts = this.contexts;
                    var bitsDecoded = this.bitsDecoded;
                    var processingFlags = this.processingFlags;
                    var processedMask = 1;
                    var firstMagnitudeBitMask = 2;
                    var length = width * height;
                    var width4 = width * 4;
                    for (var index0 = 0, indexNext; index0 < length; index0 = indexNext) {
                        indexNext = Math.min(length, index0 + width4);
                        for (var j = 0; j < width; j++) {
                            for (var index = index0 + j; index < indexNext; index += width) {
                                if (!coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
                                    continue;
                                }
                                var contextLabel = 16;
                                if ((processingFlags[index] & firstMagnitudeBitMask) !== 0) {
                                    processingFlags[index] ^= firstMagnitudeBitMask;
                                    var significance = neighborsSignificance[index] & 127;
                                    contextLabel = significance === 0 ? 15 : 14;
                                }
                                var bit = decoder.readBit(contexts, contextLabel);
                                coefficentsMagnitude[index] = coefficentsMagnitude[index] << 1 | bit;
                                bitsDecoded[index]++;
                                processingFlags[index] |= processedMask;
                            }
                        }
                    }
                },
                runCleanupPass: function BitModel_runCleanupPass() {
                    var decoder = this.decoder;
                    var width = this.width, height = this.height;
                    var neighborsSignificance = this.neighborsSignificance;
                    var coefficentsMagnitude = this.coefficentsMagnitude;
                    var coefficentsSign = this.coefficentsSign;
                    var contexts = this.contexts;
                    var labels = this.contextLabelTable;
                    var bitsDecoded = this.bitsDecoded;
                    var processingFlags = this.processingFlags;
                    var processedMask = 1;
                    var firstMagnitudeBitMask = 2;
                    var oneRowDown = width;
                    var twoRowsDown = width * 2;
                    var threeRowsDown = width * 3;
                    var iNext;
                    for (var i0 = 0; i0 < height; i0 = iNext) {
                        iNext = Math.min(i0 + 4, height);
                        var indexBase = i0 * width;
                        var checkAllEmpty = i0 + 3 < height;
                        for (var j = 0; j < width; j++) {
                            var index0 = indexBase + j;
                            var allEmpty = checkAllEmpty && processingFlags[index0] === 0 && processingFlags[index0 + oneRowDown] === 0 && processingFlags[index0 + twoRowsDown] === 0 && processingFlags[index0 + threeRowsDown] === 0 && neighborsSignificance[index0] === 0 && neighborsSignificance[index0 + oneRowDown] === 0 && neighborsSignificance[index0 + twoRowsDown] === 0 && neighborsSignificance[index0 + threeRowsDown] === 0;
                            var i1 = 0, index = index0;
                            var i = i0, sign;
                            if (allEmpty) {
                                var hasSignificantCoefficent = decoder.readBit(contexts, RUNLENGTH_CONTEXT);
                                if (!hasSignificantCoefficent) {
                                    bitsDecoded[index0]++;
                                    bitsDecoded[index0 + oneRowDown]++;
                                    bitsDecoded[index0 + twoRowsDown]++;
                                    bitsDecoded[index0 + threeRowsDown]++;
                                    continue;
                                }
                                i1 = decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
                                if (i1 !== 0) {
                                    i = i0 + i1;
                                    index += i1 * width;
                                }
                                sign = this.decodeSignBit(i, j, index);
                                coefficentsSign[index] = sign;
                                coefficentsMagnitude[index] = 1;
                                this.setNeighborsSignificance(i, j, index);
                                processingFlags[index] |= firstMagnitudeBitMask;
                                index = index0;
                                for (var i2 = i0; i2 <= i; i2++, index += width) {
                                    bitsDecoded[index]++;
                                }
                                i1++;
                            }
                            for (i = i0 + i1; i < iNext; i++, index += width) {
                                if (coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
                                    continue;
                                }
                                var contextLabel = labels[neighborsSignificance[index]];
                                var decision = decoder.readBit(contexts, contextLabel);
                                if (decision === 1) {
                                    sign = this.decodeSignBit(i, j, index);
                                    coefficentsSign[index] = sign;
                                    coefficentsMagnitude[index] = 1;
                                    this.setNeighborsSignificance(i, j, index);
                                    processingFlags[index] |= firstMagnitudeBitMask;
                                }
                                bitsDecoded[index]++;
                            }
                        }
                    }
                },
                checkSegmentationSymbol: function BitModel_checkSegmentationSymbol() {
                    var decoder = this.decoder;
                    var contexts = this.contexts;
                    var symbol = decoder.readBit(contexts, UNIFORM_CONTEXT) << 3 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 2 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
                    if (symbol !== 10) {
                        throw new JpxError('Invalid segmentation symbol');
                    }
                }
            };
            return BitModel;
        }();
        var Transform = function TransformClosure() {
            function Transform() {
            }
            Transform.prototype.calculate = function transformCalculate(subbands, u0, v0) {
                var ll = subbands[0];
                for (var i = 1, ii = subbands.length; i < ii; i++) {
                    ll = this.iterate(ll, subbands[i], u0, v0);
                }
                return ll;
            };
            Transform.prototype.extend = function extend(buffer, offset, size) {
                var i1 = offset - 1, j1 = offset + 1;
                var i2 = offset + size - 2, j2 = offset + size;
                buffer[i1--] = buffer[j1++];
                buffer[j2++] = buffer[i2--];
                buffer[i1--] = buffer[j1++];
                buffer[j2++] = buffer[i2--];
                buffer[i1--] = buffer[j1++];
                buffer[j2++] = buffer[i2--];
                buffer[i1] = buffer[j1];
                buffer[j2] = buffer[i2];
            };
            Transform.prototype.iterate = function Transform_iterate(ll, hl_lh_hh, u0, v0) {
                var llWidth = ll.width, llHeight = ll.height, llItems = ll.items;
                var width = hl_lh_hh.width;
                var height = hl_lh_hh.height;
                var items = hl_lh_hh.items;
                var i, j, k, l, u, v;
                for (k = 0, i = 0; i < llHeight; i++) {
                    l = i * 2 * width;
                    for (j = 0; j < llWidth; j++, k++, l += 2) {
                        items[l] = llItems[k];
                    }
                }
                llItems = ll.items = null;
                var bufferPadding = 4;
                var rowBuffer = new Float32Array(width + 2 * bufferPadding);
                if (width === 1) {
                    if ((u0 & 1) !== 0) {
                        for (v = 0, k = 0; v < height; v++, k += width) {
                            items[k] *= 0.5;
                        }
                    }
                } else {
                    for (v = 0, k = 0; v < height; v++, k += width) {
                        rowBuffer.set(items.subarray(k, k + width), bufferPadding);
                        this.extend(rowBuffer, bufferPadding, width);
                        this.filter(rowBuffer, bufferPadding, width);
                        items.set(rowBuffer.subarray(bufferPadding, bufferPadding + width), k);
                    }
                }
                var numBuffers = 16;
                var colBuffers = [];
                for (i = 0; i < numBuffers; i++) {
                    colBuffers.push(new Float32Array(height + 2 * bufferPadding));
                }
                var b, currentBuffer = 0;
                ll = bufferPadding + height;
                if (height === 1) {
                    if ((v0 & 1) !== 0) {
                        for (u = 0; u < width; u++) {
                            items[u] *= 0.5;
                        }
                    }
                } else {
                    for (u = 0; u < width; u++) {
                        if (currentBuffer === 0) {
                            numBuffers = Math.min(width - u, numBuffers);
                            for (k = u, l = bufferPadding; l < ll; k += width, l++) {
                                for (b = 0; b < numBuffers; b++) {
                                    colBuffers[b][l] = items[k + b];
                                }
                            }
                            currentBuffer = numBuffers;
                        }
                        currentBuffer--;
                        var buffer = colBuffers[currentBuffer];
                        this.extend(buffer, bufferPadding, height);
                        this.filter(buffer, bufferPadding, height);
                        if (currentBuffer === 0) {
                            k = u - numBuffers + 1;
                            for (l = bufferPadding; l < ll; k += width, l++) {
                                for (b = 0; b < numBuffers; b++) {
                                    items[k + b] = colBuffers[b][l];
                                }
                            }
                        }
                    }
                }
                return {
                    width,
                    height,
                    items
                };
            };
            return Transform;
        }();
        var IrreversibleTransform = function IrreversibleTransformClosure() {
            function IrreversibleTransform() {
                Transform.call(this);
            }
            IrreversibleTransform.prototype = Object.create(Transform.prototype);
            IrreversibleTransform.prototype.filter = function irreversibleTransformFilter(x, offset, length) {
                var len = length >> 1;
                offset = offset | 0;
                var j, n, current, next;
                var alpha = -1.586134342059924;
                var beta = -0.052980118572961;
                var gamma = 0.882911075530934;
                var delta = 0.443506852043971;
                var K = 1.230174104914001;
                var K_ = 1 / K;
                j = offset - 3;
                for (n = len + 4; n--; j += 2) {
                    x[j] *= K_;
                }
                j = offset - 2;
                current = delta * x[j - 1];
                for (n = len + 3; n--; j += 2) {
                    next = delta * x[j + 1];
                    x[j] = K * x[j] - current - next;
                    if (n--) {
                        j += 2;
                        current = delta * x[j + 1];
                        x[j] = K * x[j] - current - next;
                    } else {
                        break;
                    }
                }
                j = offset - 1;
                current = gamma * x[j - 1];
                for (n = len + 2; n--; j += 2) {
                    next = gamma * x[j + 1];
                    x[j] -= current + next;
                    if (n--) {
                        j += 2;
                        current = gamma * x[j + 1];
                        x[j] -= current + next;
                    } else {
                        break;
                    }
                }
                j = offset;
                current = beta * x[j - 1];
                for (n = len + 1; n--; j += 2) {
                    next = beta * x[j + 1];
                    x[j] -= current + next;
                    if (n--) {
                        j += 2;
                        current = beta * x[j + 1];
                        x[j] -= current + next;
                    } else {
                        break;
                    }
                }
                if (len !== 0) {
                    j = offset + 1;
                    current = alpha * x[j - 1];
                    for (n = len; n--; j += 2) {
                        next = alpha * x[j + 1];
                        x[j] -= current + next;
                        if (n--) {
                            j += 2;
                            current = alpha * x[j + 1];
                            x[j] -= current + next;
                        } else {
                            break;
                        }
                    }
                }
            };
            return IrreversibleTransform;
        }();
        var ReversibleTransform = function ReversibleTransformClosure() {
            function ReversibleTransform() {
                Transform.call(this);
            }
            ReversibleTransform.prototype = Object.create(Transform.prototype);
            ReversibleTransform.prototype.filter = function reversibleTransformFilter(x, offset, length) {
                var len = length >> 1;
                offset = offset | 0;
                var j, n;
                for (j = offset, n = len + 1; n--; j += 2) {
                    x[j] -= x[j - 1] + x[j + 1] + 2 >> 2;
                }
                for (j = offset + 1, n = len; n--; j += 2) {
                    x[j] += x[j - 1] + x[j + 1] >> 1;
                }
            };
            return ReversibleTransform;
        }();
        return JpxImage;
    }();
    return { JpxImage };
});