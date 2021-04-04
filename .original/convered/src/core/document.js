define([
    '../shared/util.js',
    './obj.js',
    './primitives.js',
    './core_utils.js',
    './stream.js',
    './annotation.js',
    './crypto.js',
    './parser.js',
    './operator_list.js',
    './evaluator.js'
], function (a, b, c, d, e, f, g, h, i, j) {
    'use strict';
    const DEFAULT_USER_UNIT = 1;
    const LETTER_SIZE_MEDIABOX = [
        0,
        0,
        612,
        792
    ];
    function isAnnotationRenderable(annotation, intent) {
        return intent === 'display' && annotation.viewable || intent === 'print' && annotation.printable;
    }
    class Page {
        constructor({pdfManager, xref, pageIndex, pageDict, ref, globalIdFactory, fontCache, builtInCMapCache, globalImageCache, nonBlendModesSet}) {
            this.pdfManager = pdfManager;
            this.pageIndex = pageIndex;
            this.pageDict = pageDict;
            this.xref = xref;
            this.ref = ref;
            this.fontCache = fontCache;
            this.builtInCMapCache = builtInCMapCache;
            this.globalImageCache = globalImageCache;
            this.nonBlendModesSet = nonBlendModesSet;
            this.evaluatorOptions = pdfManager.evaluatorOptions;
            this.resourcesPromise = null;
            const idCounters = { obj: 0 };
            this._localIdFactory = class extends globalIdFactory {
                static createObjId() {
                    return `p${ pageIndex }_${ ++idCounters.obj }`;
                }
            };
        }
        _getInheritableProperty(key, getArray = false) {
            const value = d.getInheritableProperty({
                dict: this.pageDict,
                key,
                getArray,
                stopWhenFound: false
            });
            if (!Array.isArray(value)) {
                return value;
            }
            if (value.length === 1 || !c.isDict(value[0])) {
                return value[0];
            }
            return c.Dict.merge({
                xref: this.xref,
                dictArray: value
            });
        }
        get content() {
            return this.pageDict.get('Contents');
        }
        get resources() {
            return a.shadow(this, 'resources', this._getInheritableProperty('Resources') || c.Dict.empty);
        }
        _getBoundingBox(name) {
            const box = this._getInheritableProperty(name, true);
            if (Array.isArray(box) && box.length === 4) {
                if (box[2] - box[0] !== 0 && box[3] - box[1] !== 0) {
                    return box;
                }
                a.warn(`Empty /${ name } entry.`);
            }
            return null;
        }
        get mediaBox() {
            return a.shadow(this, 'mediaBox', this._getBoundingBox('MediaBox') || LETTER_SIZE_MEDIABOX);
        }
        get cropBox() {
            return a.shadow(this, 'cropBox', this._getBoundingBox('CropBox') || this.mediaBox);
        }
        get userUnit() {
            let obj = this.pageDict.get('UserUnit');
            if (!a.isNum(obj) || obj <= 0) {
                obj = DEFAULT_USER_UNIT;
            }
            return a.shadow(this, 'userUnit', obj);
        }
        get view() {
            const {cropBox, mediaBox} = this;
            let view;
            if (cropBox === mediaBox || a.isArrayEqual(cropBox, mediaBox)) {
                view = mediaBox;
            } else {
                const box = a.Util.intersect(cropBox, mediaBox);
                if (box && box[2] - box[0] !== 0 && box[3] - box[1] !== 0) {
                    view = box;
                } else {
                    a.warn('Empty /CropBox and /MediaBox intersection.');
                }
            }
            return a.shadow(this, 'view', view || mediaBox);
        }
        get rotate() {
            let rotate = this._getInheritableProperty('Rotate') || 0;
            if (rotate % 90 !== 0) {
                rotate = 0;
            } else if (rotate >= 360) {
                rotate = rotate % 360;
            } else if (rotate < 0) {
                rotate = (rotate % 360 + 360) % 360;
            }
            return a.shadow(this, 'rotate', rotate);
        }
        getContentStream() {
            const content = this.content;
            let stream;
            if (Array.isArray(content)) {
                const xref = this.xref;
                const streams = [];
                for (const subStream of content) {
                    streams.push(xref.fetchIfRef(subStream));
                }
                stream = new e.StreamsSequenceStream(streams);
            } else if (c.isStream(content)) {
                stream = content;
            } else {
                stream = new e.NullStream();
            }
            return stream;
        }
        save(handler, task, annotationStorage) {
            const partialEvaluator = new j.PartialEvaluator({
                xref: this.xref,
                handler,
                pageIndex: this.pageIndex,
                idFactory: this._localIdFactory,
                fontCache: this.fontCache,
                builtInCMapCache: this.builtInCMapCache,
                globalImageCache: this.globalImageCache,
                options: this.evaluatorOptions
            });
            return this._parsedAnnotations.then(function (annotations) {
                const newRefsPromises = [];
                for (const annotation of annotations) {
                    if (!isAnnotationRenderable(annotation, 'print')) {
                        continue;
                    }
                    newRefsPromises.push(annotation.save(partialEvaluator, task, annotationStorage).catch(function (reason) {
                        a.warn('save - ignoring annotation data during ' + `"${ task.name }" task: "${ reason }".`);
                        return null;
                    }));
                }
                return Promise.all(newRefsPromises);
            });
        }
        loadResources(keys) {
            if (!this.resourcesPromise) {
                this.resourcesPromise = this.pdfManager.ensure(this, 'resources');
            }
            return this.resourcesPromise.then(() => {
                const objectLoader = new b.ObjectLoader(this.resources, keys, this.xref);
                return objectLoader.load();
            });
        }
        getOperatorList({handler, sink, task, intent, renderInteractiveForms, annotationStorage}) {
            const contentStreamPromise = this.pdfManager.ensure(this, 'getContentStream');
            const resourcesPromise = this.loadResources([
                'ExtGState',
                'ColorSpace',
                'Pattern',
                'Shading',
                'XObject',
                'Font'
            ]);
            const partialEvaluator = new j.PartialEvaluator({
                xref: this.xref,
                handler,
                pageIndex: this.pageIndex,
                idFactory: this._localIdFactory,
                fontCache: this.fontCache,
                builtInCMapCache: this.builtInCMapCache,
                globalImageCache: this.globalImageCache,
                options: this.evaluatorOptions
            });
            const dataPromises = Promise.all([
                contentStreamPromise,
                resourcesPromise
            ]);
            const pageListPromise = dataPromises.then(([contentStream]) => {
                const opList = new i.OperatorList(intent, sink);
                handler.send('StartRenderPage', {
                    transparency: partialEvaluator.hasBlendModes(this.resources, this.nonBlendModesSet),
                    pageIndex: this.pageIndex,
                    intent
                });
                return partialEvaluator.getOperatorList({
                    stream: contentStream,
                    task,
                    resources: this.resources,
                    operatorList: opList
                }).then(function () {
                    return opList;
                });
            });
            return Promise.all([
                pageListPromise,
                this._parsedAnnotations
            ]).then(function ([pageOpList, annotations]) {
                if (annotations.length === 0) {
                    pageOpList.flush(true);
                    return { length: pageOpList.totalLength };
                }
                const opListPromises = [];
                for (const annotation of annotations) {
                    if (isAnnotationRenderable(annotation, intent) && !annotation.isHidden(annotationStorage)) {
                        opListPromises.push(annotation.getOperatorList(partialEvaluator, task, renderInteractiveForms, annotationStorage).catch(function (reason) {
                            a.warn('getOperatorList - ignoring annotation data during ' + `"${ task.name }" task: "${ reason }".`);
                            return null;
                        }));
                    }
                }
                return Promise.all(opListPromises).then(function (opLists) {
                    pageOpList.addOp(a.OPS.beginAnnotations, []);
                    for (const opList of opLists) {
                        pageOpList.addOpList(opList);
                    }
                    pageOpList.addOp(a.OPS.endAnnotations, []);
                    pageOpList.flush(true);
                    return { length: pageOpList.totalLength };
                });
            });
        }
        extractTextContent({handler, task, normalizeWhitespace, sink, combineTextItems}) {
            const contentStreamPromise = this.pdfManager.ensure(this, 'getContentStream');
            const resourcesPromise = this.loadResources([
                'ExtGState',
                'XObject',
                'Font'
            ]);
            const dataPromises = Promise.all([
                contentStreamPromise,
                resourcesPromise
            ]);
            return dataPromises.then(([contentStream]) => {
                const partialEvaluator = new j.PartialEvaluator({
                    xref: this.xref,
                    handler,
                    pageIndex: this.pageIndex,
                    idFactory: this._localIdFactory,
                    fontCache: this.fontCache,
                    builtInCMapCache: this.builtInCMapCache,
                    globalImageCache: this.globalImageCache,
                    options: this.evaluatorOptions
                });
                return partialEvaluator.getTextContent({
                    stream: contentStream,
                    task,
                    resources: this.resources,
                    normalizeWhitespace,
                    combineTextItems,
                    sink
                });
            });
        }
        getAnnotationsData(intent) {
            return this._parsedAnnotations.then(function (annotations) {
                const annotationsData = [];
                for (let i = 0, ii = annotations.length; i < ii; i++) {
                    if (!intent || isAnnotationRenderable(annotations[i], intent)) {
                        annotationsData.push(annotations[i].data);
                    }
                }
                return annotationsData;
            });
        }
        get annotations() {
            const annots = this._getInheritableProperty('Annots');
            return a.shadow(this, 'annotations', Array.isArray(annots) ? annots : []);
        }
        get _parsedAnnotations() {
            const parsedAnnotations = this.pdfManager.ensure(this, 'annotations').then(() => {
                const annotationPromises = [];
                for (const annotationRef of this.annotations) {
                    annotationPromises.push(f.AnnotationFactory.create(this.xref, annotationRef, this.pdfManager, this._localIdFactory).catch(function (reason) {
                        a.warn(`_parsedAnnotations: "${ reason }".`);
                        return null;
                    }));
                }
                return Promise.all(annotationPromises).then(function (annotations) {
                    return annotations.filter(annotation => !!annotation);
                });
            });
            return a.shadow(this, '_parsedAnnotations', parsedAnnotations);
        }
        get jsActions() {
            const actions = d.collectActions(this.xref, this.pageDict, a.PageActionEventType);
            return a.shadow(this, 'jsActions', actions);
        }
    }
    const PDF_HEADER_SIGNATURE = new Uint8Array([
        37,
        80,
        68,
        70,
        45
    ]);
    const STARTXREF_SIGNATURE = new Uint8Array([
        115,
        116,
        97,
        114,
        116,
        120,
        114,
        101,
        102
    ]);
    const ENDOBJ_SIGNATURE = new Uint8Array([
        101,
        110,
        100,
        111,
        98,
        106
    ]);
    const FINGERPRINT_FIRST_BYTES = 1024;
    const EMPTY_FINGERPRINT = '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0';
    const PDF_HEADER_VERSION_REGEXP = /^[1-9]\.[0-9]$/;
    function find(stream, signature, limit = 1024, backwards = false) {
        if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
            a.assert(limit > 0, 'The "limit" must be a positive integer.');
        }
        const signatureLength = signature.length;
        const scanBytes = stream.peekBytes(limit);
        const scanLength = scanBytes.length - signatureLength;
        if (scanLength <= 0) {
            return false;
        }
        if (backwards) {
            const signatureEnd = signatureLength - 1;
            let pos = scanBytes.length - 1;
            while (pos >= signatureEnd) {
                let j = 0;
                while (j < signatureLength && scanBytes[pos - j] === signature[signatureEnd - j]) {
                    j++;
                }
                if (j >= signatureLength) {
                    stream.pos += pos - signatureEnd;
                    return true;
                }
                pos--;
            }
        } else {
            let pos = 0;
            while (pos <= scanLength) {
                let j = 0;
                while (j < signatureLength && scanBytes[pos + j] === signature[j]) {
                    j++;
                }
                if (j >= signatureLength) {
                    stream.pos += pos;
                    return true;
                }
                pos++;
            }
        }
        return false;
    }
    class PDFDocument {
        constructor(pdfManager, arg) {
            let stream;
            if (c.isStream(arg)) {
                stream = arg;
            } else if (a.isArrayBuffer(arg)) {
                stream = new e.Stream(arg);
            } else {
                throw new Error('PDFDocument: Unknown argument type');
            }
            if (stream.length <= 0) {
                throw new a.InvalidPDFException('The PDF file is empty, i.e. its size is zero bytes.');
            }
            this.pdfManager = pdfManager;
            this.stream = stream;
            this.xref = new b.XRef(stream, pdfManager);
            this._pagePromises = [];
            this._version = null;
            const idCounters = { font: 0 };
            this._globalIdFactory = class {
                static getDocId() {
                    return `g_${ pdfManager.docId }`;
                }
                static createFontId() {
                    return `f${ ++idCounters.font }`;
                }
                static createObjId() {
                    a.unreachable('Abstract method `createObjId` called.');
                }
            };
        }
        parse(recoveryMode) {
            this.xref.parse(recoveryMode);
            this.catalog = new b.Catalog(this.pdfManager, this.xref);
            if (this.catalog.version) {
                this._version = this.catalog.version;
            }
        }
        get linearization() {
            let linearization = null;
            try {
                linearization = h.Linearization.create(this.stream);
            } catch (err) {
                if (err instanceof d.MissingDataException) {
                    throw err;
                }
                a.info(err);
            }
            return a.shadow(this, 'linearization', linearization);
        }
        get startXRef() {
            const stream = this.stream;
            let startXRef = 0;
            if (this.linearization) {
                stream.reset();
                if (find(stream, ENDOBJ_SIGNATURE)) {
                    startXRef = stream.pos + 6 - stream.start;
                }
            } else {
                const step = 1024;
                const startXRefLength = STARTXREF_SIGNATURE.length;
                let found = false, pos = stream.end;
                while (!found && pos > 0) {
                    pos -= step - startXRefLength;
                    if (pos < 0) {
                        pos = 0;
                    }
                    stream.pos = pos;
                    found = find(stream, STARTXREF_SIGNATURE, step, true);
                }
                if (found) {
                    stream.skip(9);
                    let ch;
                    do {
                        ch = stream.getByte();
                    } while (d.isWhiteSpace(ch));
                    let str = '';
                    while (ch >= 32 && ch <= 57) {
                        str += String.fromCharCode(ch);
                        ch = stream.getByte();
                    }
                    startXRef = parseInt(str, 10);
                    if (isNaN(startXRef)) {
                        startXRef = 0;
                    }
                }
            }
            return a.shadow(this, 'startXRef', startXRef);
        }
        checkHeader() {
            const stream = this.stream;
            stream.reset();
            if (!find(stream, PDF_HEADER_SIGNATURE)) {
                return;
            }
            stream.moveStart();
            const MAX_PDF_VERSION_LENGTH = 12;
            let version = '', ch;
            while ((ch = stream.getByte()) > 32) {
                if (version.length >= MAX_PDF_VERSION_LENGTH) {
                    break;
                }
                version += String.fromCharCode(ch);
            }
            if (!this._version) {
                this._version = version.substring(5);
            }
        }
        parseStartXRef() {
            this.xref.setStartXRef(this.startXRef);
        }
        get numPages() {
            const linearization = this.linearization;
            const num = linearization ? linearization.numPages : this.catalog.numPages;
            return a.shadow(this, 'numPages', num);
        }
        _hasOnlyDocumentSignatures(fields, recursionDepth = 0) {
            const RECURSION_LIMIT = 10;
            if (!Array.isArray(fields)) {
                return false;
            }
            return fields.every(field => {
                field = this.xref.fetchIfRef(field);
                if (!(field instanceof c.Dict)) {
                    return false;
                }
                if (field.has('Kids')) {
                    if (++recursionDepth > RECURSION_LIMIT) {
                        a.warn('_hasOnlyDocumentSignatures: maximum recursion depth reached');
                        return false;
                    }
                    return this._hasOnlyDocumentSignatures(field.get('Kids'), recursionDepth);
                }
                const isSignature = c.isName(field.get('FT'), 'Sig');
                const rectangle = field.get('Rect');
                const isInvisible = Array.isArray(rectangle) && rectangle.every(value => value === 0);
                return isSignature && isInvisible;
            });
        }
        get formInfo() {
            const formInfo = {
                hasFields: false,
                hasAcroForm: false,
                hasXfa: false
            };
            const acroForm = this.catalog.acroForm;
            if (!acroForm) {
                return a.shadow(this, 'formInfo', formInfo);
            }
            try {
                const fields = acroForm.get('Fields');
                const hasFields = Array.isArray(fields) && fields.length > 0;
                formInfo.hasFields = hasFields;
                const xfa = acroForm.get('XFA');
                formInfo.hasXfa = Array.isArray(xfa) && xfa.length > 0 || c.isStream(xfa) && !xfa.isEmpty;
                const sigFlags = acroForm.get('SigFlags');
                const hasOnlyDocumentSignatures = !!(sigFlags & 1) && this._hasOnlyDocumentSignatures(fields);
                formInfo.hasAcroForm = hasFields && !hasOnlyDocumentSignatures;
            } catch (ex) {
                if (ex instanceof d.MissingDataException) {
                    throw ex;
                }
                a.warn(`Cannot fetch form information: "${ ex }".`);
            }
            return a.shadow(this, 'formInfo', formInfo);
        }
        get documentInfo() {
            const DocumentInfoValidators = {
                Title: a.isString,
                Author: a.isString,
                Subject: a.isString,
                Keywords: a.isString,
                Creator: a.isString,
                Producer: a.isString,
                CreationDate: a.isString,
                ModDate: a.isString,
                Trapped: c.isName
            };
            let version = this._version;
            if (typeof version !== 'string' || !PDF_HEADER_VERSION_REGEXP.test(version)) {
                a.warn(`Invalid PDF header version number: ${ version }`);
                version = null;
            }
            const docInfo = {
                PDFFormatVersion: version,
                IsLinearized: !!this.linearization,
                IsAcroFormPresent: this.formInfo.hasAcroForm,
                IsXFAPresent: this.formInfo.hasXfa,
                IsCollectionPresent: !!this.catalog.collection
            };
            let infoDict;
            try {
                infoDict = this.xref.trailer.get('Info');
            } catch (err) {
                if (err instanceof d.MissingDataException) {
                    throw err;
                }
                a.info('The document information dictionary is invalid.');
            }
            if (c.isDict(infoDict)) {
                for (const key of infoDict.getKeys()) {
                    const value = infoDict.get(key);
                    if (DocumentInfoValidators[key]) {
                        if (DocumentInfoValidators[key](value)) {
                            docInfo[key] = typeof value !== 'string' ? value : a.stringToPDFString(value);
                        } else {
                            a.info(`Bad value in document info for "${ key }".`);
                        }
                    } else if (typeof key === 'string') {
                        let customValue;
                        if (a.isString(value)) {
                            customValue = a.stringToPDFString(value);
                        } else if (c.isName(value) || a.isNum(value) || a.isBool(value)) {
                            customValue = value;
                        } else {
                            a.info(`Unsupported value in document info for (custom) "${ key }".`);
                            continue;
                        }
                        if (!docInfo.Custom) {
                            docInfo.Custom = Object.create(null);
                        }
                        docInfo.Custom[key] = customValue;
                    }
                }
            }
            return a.shadow(this, 'documentInfo', docInfo);
        }
        get fingerprint() {
            let hash;
            const idArray = this.xref.trailer.get('ID');
            if (Array.isArray(idArray) && idArray[0] && a.isString(idArray[0]) && idArray[0] !== EMPTY_FINGERPRINT) {
                hash = a.stringToBytes(idArray[0]);
            } else {
                hash = g.calculateMD5(this.stream.getByteRange(0, FINGERPRINT_FIRST_BYTES), 0, FINGERPRINT_FIRST_BYTES);
            }
            const fingerprintBuf = [];
            for (let i = 0, ii = hash.length; i < ii; i++) {
                const hex = hash[i].toString(16);
                fingerprintBuf.push(hex.padStart(2, '0'));
            }
            return a.shadow(this, 'fingerprint', fingerprintBuf.join(''));
        }
        _getLinearizationPage(pageIndex) {
            const {catalog, linearization} = this;
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                a.assert(linearization && linearization.pageFirst === pageIndex, '_getLinearizationPage - invalid pageIndex argument.');
            }
            const ref = c.Ref.get(linearization.objectNumberFirst, 0);
            return this.xref.fetchAsync(ref).then(obj => {
                if (c.isDict(obj, 'Page') || c.isDict(obj) && !obj.has('Type') && obj.has('Contents')) {
                    if (ref && !catalog.pageKidsCountCache.has(ref)) {
                        catalog.pageKidsCountCache.put(ref, 1);
                    }
                    return [
                        obj,
                        ref
                    ];
                }
                throw new a.FormatError("The Linearization dictionary doesn't point " + 'to a valid Page dictionary.');
            }).catch(reason => {
                a.info(reason);
                return catalog.getPageDict(pageIndex);
            });
        }
        getPage(pageIndex) {
            if (this._pagePromises[pageIndex] !== undefined) {
                return this._pagePromises[pageIndex];
            }
            const {catalog, linearization} = this;
            const promise = linearization && linearization.pageFirst === pageIndex ? this._getLinearizationPage(pageIndex) : catalog.getPageDict(pageIndex);
            return this._pagePromises[pageIndex] = promise.then(([pageDict, ref]) => {
                return new Page({
                    pdfManager: this.pdfManager,
                    xref: this.xref,
                    pageIndex,
                    pageDict,
                    ref,
                    globalIdFactory: this._globalIdFactory,
                    fontCache: catalog.fontCache,
                    builtInCMapCache: catalog.builtInCMapCache,
                    globalImageCache: catalog.globalImageCache,
                    nonBlendModesSet: catalog.nonBlendModesSet
                });
            });
        }
        checkFirstPage() {
            return this.getPage(0).catch(async reason => {
                if (reason instanceof d.XRefEntryException) {
                    this._pagePromises.length = 0;
                    await this.cleanup();
                    throw new d.XRefParseException();
                }
            });
        }
        fontFallback(id, handler) {
            return this.catalog.fontFallback(id, handler);
        }
        async cleanup(manuallyTriggered = false) {
            return this.catalog ? this.catalog.cleanup(manuallyTriggered) : c.clearPrimitiveCaches();
        }
        _collectFieldObjects(name, fieldRef, promises) {
            const field = this.xref.fetchIfRef(fieldRef);
            if (field.has('T')) {
                const partName = a.stringToPDFString(field.get('T'));
                if (name === '') {
                    name = partName;
                } else {
                    name = `${ name }.${ partName }`;
                }
            }
            if (!promises.has(name)) {
                promises.set(name, []);
            }
            promises.get(name).push(f.AnnotationFactory.create(this.xref, fieldRef, this.pdfManager, this._localIdFactory).then(annotation => annotation && annotation.getFieldObject()).catch(function (reason) {
                a.warn(`_collectFieldObjects: "${ reason }".`);
                return null;
            }));
            if (field.has('Kids')) {
                const kids = field.get('Kids');
                for (const kid of kids) {
                    this._collectFieldObjects(name, kid, promises);
                }
            }
        }
        get fieldObjects() {
            if (!this.formInfo.hasFields) {
                return a.shadow(this, 'fieldObjects', Promise.resolve(null));
            }
            const allFields = Object.create(null);
            const fieldPromises = new Map();
            for (const fieldRef of this.catalog.acroForm.get('Fields')) {
                this._collectFieldObjects('', fieldRef, fieldPromises);
            }
            const allPromises = [];
            for (const [name, promises] of fieldPromises) {
                allPromises.push(Promise.all(promises).then(fields => {
                    fields = fields.filter(field => !!field);
                    if (fields.length > 0) {
                        allFields[name] = fields;
                    }
                }));
            }
            return a.shadow(this, 'fieldObjects', Promise.all(allPromises).then(() => allFields));
        }
        get hasJSActions() {
            return a.shadow(this, 'hasJSActions', this.fieldObjects.then(fieldObjects => {
                return fieldObjects !== null && Object.values(fieldObjects).some(fieldObject => fieldObject.some(object => object.actions !== null)) || !!this.catalog.jsActions;
            }));
        }
        get calculationOrderIds() {
            const acroForm = this.catalog.acroForm;
            if (!acroForm || !acroForm.has('CO')) {
                return a.shadow(this, 'calculationOrderIds', null);
            }
            const calculationOrder = acroForm.get('CO');
            if (!Array.isArray(calculationOrder) || calculationOrder.length === 0) {
                return a.shadow(this, 'calculationOrderIds', null);
            }
            const ids = calculationOrder.filter(c.isRef).map(ref => ref.toString());
            if (ids.length === 0) {
                return a.shadow(this, 'calculationOrderIds', null);
            }
            return a.shadow(this, 'calculationOrderIds', ids);
        }
    }
    return {
        Page,
        PDFDocument
    };
});