define([
    './common.js',
    './pdf_object.js',
    './print_params.js',
    './constants.js'
], function (a, b, c, d) {
    'use strict';
    class InfoProxyHandler {
        static get(obj, prop) {
            return obj[prop.toLowerCase()];
        }
        static set(obj, prop, value) {
            throw new Error(`doc.info.${ prop } is read-only`);
        }
    }
    class Doc extends b.PDFObject {
        constructor(data) {
            super(data);
            this._expandos = globalThis;
            this._baseURL = data.baseURL || '';
            this._calculate = true;
            this._delay = false;
            this._dirty = false;
            this._disclosed = false;
            this._media = undefined;
            this._metadata = data.metadata || '';
            this._noautocomplete = undefined;
            this._nocache = undefined;
            this._spellDictionaryOrder = [];
            this._spellLanguageOrder = [];
            this._printParams = null;
            this._fields = new Map();
            this._fieldNames = [];
            this._event = null;
            this._author = data.Author || '';
            this._creator = data.Creator || '';
            this._creationDate = this._getDate(data.CreationDate) || null;
            this._docID = data.docID || [
                '',
                ''
            ];
            this._documentFileName = data.filename || '';
            this._filesize = data.filesize || 0;
            this._keywords = data.Keywords || '';
            this._layout = data.layout || '';
            this._modDate = this._getDate(data.ModDate) || null;
            this._numFields = 0;
            this._numPages = data.numPages || 1;
            this._pageNum = data.pageNum || 0;
            this._producer = data.Producer || '';
            this._subject = data.Subject || '';
            this._title = data.Title || '';
            this._URL = data.URL || '';
            this._info = new Proxy({
                title: this._title,
                author: this._author,
                authors: data.authors || [this._author],
                subject: this._subject,
                keywords: this._keywords,
                creator: this._creator,
                producer: this._producer,
                creationdate: this._creationDate,
                moddate: this._modDate,
                trapped: data.Trapped || 'Unknown'
            }, InfoProxyHandler);
            this._zoomType = d.ZoomType.none;
            this._zoom = data.zoom || 100;
            this._actions = a.createActionsMap(data.actions);
            this._globalEval = data.globalEval;
            this._pageActions = new Map();
        }
        _dispatchDocEvent(name) {
            if (name === 'Open') {
                const dontRun = new Set([
                    'WillClose',
                    'WillSave',
                    'DidSave',
                    'WillPrint',
                    'DidPrint',
                    'OpenAction'
                ]);
                for (const actionName of this._actions.keys()) {
                    if (!dontRun.has(actionName)) {
                        this._runActions(actionName);
                    }
                }
                this._runActions('OpenAction');
            } else {
                this._runActions(name);
            }
        }
        _dispatchPageEvent(name, actions, pageNumber) {
            if (name === 'PageOpen') {
                if (!this._pageActions.has(pageNumber)) {
                    this._pageActions.set(pageNumber, a.createActionsMap(actions));
                }
                this._pageNum = pageNumber - 1;
            }
            actions = this._pageActions.get(pageNumber) && this._pageActions.get(pageNumber).get(name);
            if (actions) {
                for (const action of actions) {
                    this._globalEval(action);
                }
            }
        }
        _runActions(name) {
            const actions = this._actions.get(name);
            if (actions) {
                for (const action of actions) {
                    this._globalEval(action);
                }
            }
        }
        _addField(name, field) {
            this._fields.set(name, field);
            this._fieldNames.push(name);
            this._numFields++;
        }
        _getDate(date) {
            if (!date || date.length < 15 || !date.startsWith('D:')) {
                return date;
            }
            date = date.substring(2);
            const year = date.substring(0, 4);
            const month = date.substring(4, 6);
            const day = date.substring(6, 8);
            const hour = date.substring(8, 10);
            const minute = date.substring(10, 12);
            const o = date.charAt(12);
            let second, offsetPos;
            if (o === 'Z' || o === '+' || o === '-') {
                second = '00';
                offsetPos = 12;
            } else {
                second = date.substring(12, 14);
                offsetPos = 14;
            }
            const offset = date.substring(offsetPos).replaceAll("'", '');
            return new Date(`${ year }-${ month }-${ day }T${ hour }:${ minute }:${ second }${ offset }`);
        }
        get author() {
            return this._author;
        }
        set author(_) {
            throw new Error('doc.author is read-only');
        }
        get baseURL() {
            return this._baseURL;
        }
        set baseURL(baseURL) {
            this._baseURL = baseURL;
        }
        get bookmarkRoot() {
            return undefined;
        }
        set bookmarkRoot(_) {
            throw new Error('doc.bookmarkRoot is read-only');
        }
        get calculate() {
            return this._calculate;
        }
        set calculate(calculate) {
            this._calculate = calculate;
        }
        get creator() {
            return this._creator;
        }
        set creator(_) {
            throw new Error('doc.creator is read-only');
        }
        get dataObjects() {
            return [];
        }
        set dataObjects(_) {
            throw new Error('doc.dataObjects is read-only');
        }
        get delay() {
            return this._delay;
        }
        set delay(delay) {
            this._delay = delay;
        }
        get dirty() {
            return this._dirty;
        }
        set dirty(dirty) {
            this._dirty = dirty;
        }
        get disclosed() {
            return this._disclosed;
        }
        set disclosed(disclosed) {
            this._disclosed = disclosed;
        }
        get docID() {
            return this._docID;
        }
        set docID(_) {
            throw new Error('doc.docID is read-only');
        }
        get documentFileName() {
            return this._documentFileName;
        }
        set documentFileName(_) {
            throw new Error('doc.documentFileName is read-only');
        }
        get dynamicXFAForm() {
            return false;
        }
        set dynamicXFAForm(_) {
            throw new Error('doc.dynamicXFAForm is read-only');
        }
        get external() {
            return true;
        }
        set external(_) {
            throw new Error('doc.external is read-only');
        }
        get filesize() {
            return this._filesize;
        }
        set filesize(_) {
            throw new Error('doc.filesize is read-only');
        }
        get hidden() {
            return false;
        }
        set hidden(_) {
            throw new Error('doc.hidden is read-only');
        }
        get hostContainer() {
            return undefined;
        }
        set hostContainer(_) {
            throw new Error('doc.hostContainer is read-only');
        }
        get icons() {
            return undefined;
        }
        set icons(_) {
            throw new Error('doc.icons is read-only');
        }
        get info() {
            return this._info;
        }
        set info(_) {
            throw new Error('doc.info is read-only');
        }
        get innerAppWindowRect() {
            return [
                0,
                0,
                0,
                0
            ];
        }
        set innerAppWindowRect(_) {
            throw new Error('doc.innerAppWindowRect is read-only');
        }
        get innerDocWindowRect() {
            return [
                0,
                0,
                0,
                0
            ];
        }
        set innerDocWindowRect(_) {
            throw new Error('doc.innerDocWindowRect is read-only');
        }
        get isModal() {
            return false;
        }
        set isModal(_) {
            throw new Error('doc.isModal is read-only');
        }
        get keywords() {
            return this._keywords;
        }
        set keywords(_) {
            throw new Error('doc.keywords is read-only');
        }
        get layout() {
            return this._layout;
        }
        set layout(value) {
            if (typeof value !== 'string') {
                return;
            }
            if (value !== 'SinglePage' && value !== 'OneColumn' && value !== 'TwoColumnLeft' && value !== 'TwoPageLeft' && value !== 'TwoColumnRight' && value !== 'TwoPageRight') {
                value = 'SinglePage';
            }
            this._send({
                command: 'layout',
                value
            });
            this._layout = value;
        }
        get media() {
            return this._media;
        }
        set media(media) {
            this._media = media;
        }
        get metadata() {
            return this._metadata;
        }
        set metadata(metadata) {
            this._metadata = metadata;
        }
        get modDate() {
            return this._modDate;
        }
        set modDate(_) {
            throw new Error('doc.modDate is read-only');
        }
        get mouseX() {
            return 0;
        }
        set mouseX(_) {
            throw new Error('doc.mouseX is read-only');
        }
        get mouseY() {
            return 0;
        }
        set mouseY(_) {
            throw new Error('doc.mouseY is read-only');
        }
        get noautocomplete() {
            return this._noautocomplete;
        }
        set noautocomplete(noautocomplete) {
            this._noautocomplete = noautocomplete;
        }
        get nocache() {
            return this._nocache;
        }
        set nocache(nocache) {
            this._nocache = nocache;
        }
        get numFields() {
            return this._numFields;
        }
        set numFields(_) {
            throw new Error('doc.numFields is read-only');
        }
        get numPages() {
            return this._numPages;
        }
        set numPages(_) {
            throw new Error('doc.numPages is read-only');
        }
        get numTemplates() {
            return 0;
        }
        set numTemplates(_) {
            throw new Error('doc.numTemplates is read-only');
        }
        get outerAppWindowRect() {
            return [
                0,
                0,
                0,
                0
            ];
        }
        set outerAppWindowRect(_) {
            throw new Error('doc.outerAppWindowRect is read-only');
        }
        get outerDocWindowRect() {
            return [
                0,
                0,
                0,
                0
            ];
        }
        set outerDocWindowRect(_) {
            throw new Error('doc.outerDocWindowRect is read-only');
        }
        get pageNum() {
            return this._pageNum;
        }
        set pageNum(value) {
            if (typeof value !== 'number' || value < 0 || value >= this._numPages) {
                return;
            }
            this._send({
                command: 'page-num',
                value
            });
            this._pageNum = value;
        }
        get pageWindowRect() {
            return [
                0,
                0,
                0,
                0
            ];
        }
        set pageWindowRect(_) {
            throw new Error('doc.pageWindowRect is read-only');
        }
        get path() {
            return '';
        }
        set path(_) {
            throw new Error('doc.path is read-only');
        }
        get permStatusReady() {
            return true;
        }
        set permStatusReady(_) {
            throw new Error('doc.permStatusReady is read-only');
        }
        get producer() {
            return this._producer;
        }
        set producer(_) {
            throw new Error('doc.producer is read-only');
        }
        get requiresFullSave() {
            return false;
        }
        set requiresFullSave(_) {
            throw new Error('doc.requiresFullSave is read-only');
        }
        get securityHandler() {
            return null;
        }
        set securityHandler(_) {
            throw new Error('doc.securityHandler is read-only');
        }
        get selectedAnnots() {
            return [];
        }
        set selectedAnnots(_) {
            throw new Error('doc.selectedAnnots is read-only');
        }
        get sounds() {
            return [];
        }
        set sounds(_) {
            throw new Error('doc.sounds is read-only');
        }
        get spellDictionaryOrder() {
            return this._spellDictionaryOrder;
        }
        set spellDictionaryOrder(spellDictionaryOrder) {
            this._spellDictionaryOrder = spellDictionaryOrder;
        }
        get spellLanguageOrder() {
            return this._spellLanguageOrder;
        }
        set spellLanguageOrder(spellLanguageOrder) {
            this._spellLanguageOrder = spellLanguageOrder;
        }
        get subject() {
            return this._subject;
        }
        set subject(_) {
            throw new Error('doc.subject is read-only');
        }
        get templates() {
            return [];
        }
        set templates(_) {
            throw new Error('doc.templates is read-only');
        }
        get title() {
            return this._title;
        }
        set title(_) {
            throw new Error('doc.title is read-only');
        }
        get URL() {
            return this._URL;
        }
        set URL(_) {
            throw new Error('doc.URL is read-only');
        }
        get viewState() {
            return undefined;
        }
        set viewState(_) {
            throw new Error('doc.viewState is read-only');
        }
        get xfa() {
            return this._xfa;
        }
        set xfa(_) {
            throw new Error('doc.xfa is read-only');
        }
        get XFAForeground() {
            return false;
        }
        set XFAForeground(_) {
            throw new Error('doc.XFAForeground is read-only');
        }
        get zoomType() {
            return this._zoomType;
        }
        set zoomType(type) {
            if (typeof type !== 'string') {
                return;
            }
            switch (type) {
            case d.ZoomType.none:
                this._send({
                    command: 'zoom',
                    value: 1
                });
                break;
            case d.ZoomType.fitP:
                this._send({
                    command: 'zoom',
                    value: 'page-fit'
                });
                break;
            case d.ZoomType.fitW:
                this._send({
                    command: 'zoom',
                    value: 'page-width'
                });
                break;
            case d.ZoomType.fitH:
                this._send({
                    command: 'zoom',
                    value: 'page-height'
                });
                break;
            case d.ZoomType.fitV:
                this._send({
                    command: 'zoom',
                    value: 'auto'
                });
                break;
            case d.ZoomType.pref:
            case d.ZoomType.refW:
                break;
            default:
                return;
            }
            this._zoomType = type;
        }
        get zoom() {
            return this._zoom;
        }
        set zoom(value) {
            if (typeof value !== 'number' || value < 8.33 || value > 6400) {
                return;
            }
            this._send({
                command: 'zoom',
                value: value / 100
            });
        }
        addAnnot() {
        }
        addField() {
        }
        addIcon() {
        }
        addLink() {
        }
        addRecipientListCryptFilter() {
        }
        addRequirement() {
        }
        addScript() {
        }
        addThumbnails() {
        }
        addWatermarkFromFile() {
        }
        addWatermarkFromText() {
        }
        addWeblinks() {
        }
        bringToFront() {
        }
        calculateNow() {
            this._eventDispatcher.calculateNow();
        }
        closeDoc() {
        }
        colorConvertPage() {
        }
        createDataObject() {
        }
        createTemplate() {
        }
        deletePages() {
        }
        deleteSound() {
        }
        embedDocAsDataObject() {
        }
        embedOutputIntent() {
        }
        encryptForRecipients() {
        }
        encryptUsingPolicy() {
        }
        exportAsFDF() {
        }
        exportAsFDFStr() {
        }
        exportAsText() {
        }
        exportAsXFDF() {
        }
        exportAsXFDFStr() {
        }
        exportDataObject() {
        }
        exportXFAData() {
        }
        extractPages() {
        }
        flattenPages() {
        }
        getAnnot() {
        }
        getAnnots() {
        }
        getAnnot3D() {
        }
        getAnnots3D() {
        }
        getColorConvertAction() {
        }
        getDataObject() {
        }
        getDataObjectContents() {
        }
        getField(cName) {
            if (typeof cName !== 'string') {
                throw new TypeError('Invalid field name: must be a string');
            }
            const searchedField = this._fields.get(cName);
            if (searchedField) {
                return searchedField;
            }
            for (const [name, field] of this._fields.entries()) {
                if (name.includes(cName)) {
                    return field;
                }
            }
            return undefined;
        }
        getIcon() {
        }
        getLegalWarnings() {
        }
        getLinks() {
        }
        getNthFieldName(nIndex) {
            if (typeof nIndex !== 'number') {
                throw new TypeError('Invalid field index: must be a number');
            }
            if (0 <= nIndex && nIndex < this.numFields) {
                return this._fieldNames[Math.trunc(nIndex)];
            }
            return null;
        }
        getNthTemplate() {
            return null;
        }
        getOCGs() {
        }
        getOCGOrder() {
        }
        getPageBox() {
        }
        getPageLabel() {
        }
        getPageNthWord() {
        }
        getPageNthWordQuads() {
        }
        getPageNumWords() {
        }
        getPageRotation() {
        }
        getPageTransition() {
        }
        getPrintParams() {
            if (!this._printParams) {
                this._printParams = new c.PrintParams({ lastPage: this._numPages - 1 });
            }
            return this._printParams;
        }
        getSound() {
        }
        getTemplate() {
        }
        getURL() {
        }
        gotoNamedDest() {
        }
        importAnFDF() {
        }
        importAnXFDF() {
        }
        importDataObject() {
        }
        importIcon() {
        }
        importSound() {
        }
        importTextData() {
        }
        importXFAData() {
        }
        insertPages() {
        }
        mailDoc() {
        }
        mailForm() {
        }
        movePage() {
        }
        newPage() {
        }
        openDataObject() {
        }
        print(bUI = true, nStart = 0, nEnd = -1, bSilent = false, bShrinkToFit = false, bPrintAsImage = false, bReverse = false, bAnnotations = true, printParams = null) {
            if (printParams) {
                nStart = printParams.firstPage;
                nEnd = printParams.lastPage;
            }
            if (typeof nStart === 'number') {
                nStart = Math.max(0, Math.trunc(nStart));
            } else {
                nStart = 0;
            }
            if (typeof nEnd === 'number') {
                nEnd = Math.max(0, Math.trunc(nEnd));
            } else {
                nEnd = -1;
            }
            this._send({
                command: 'print',
                start: nStart,
                end: nEnd
            });
        }
        removeDataObject() {
        }
        removeField() {
        }
        removeIcon() {
        }
        removeLinks() {
        }
        removeRequirement() {
        }
        removeScript() {
        }
        removeTemplate() {
        }
        removeThumbnails() {
        }
        removeWeblinks() {
        }
        replacePages() {
        }
        resetForm(aFields = null) {
            let mustCalculate = false;
            if (aFields) {
                for (const fieldName of aFields) {
                    const field = this.getField(fieldName);
                    if (field) {
                        field.value = field.defaultValue;
                        field.valueAsString = field.value;
                        mustCalculate = true;
                    }
                }
            } else {
                mustCalculate = this._fields.size !== 0;
                for (const field of this._fields.values()) {
                    field.value = field.defaultValue;
                    field.valueAsString = field.value;
                }
            }
            if (mustCalculate) {
                this.calculateNow();
            }
        }
        saveAs() {
        }
        scroll() {
        }
        selectPageNthWord() {
        }
        setAction() {
        }
        setDataObjectContents() {
        }
        setOCGOrder() {
        }
        setPageAction() {
        }
        setPageBoxes() {
        }
        setPageLabels() {
        }
        setPageRotations() {
        }
        setPageTabOrder() {
        }
        setPageTransitions() {
        }
        spawnPageFromTemplate() {
        }
        submitForm() {
        }
        syncAnnotScan() {
        }
    }
    return { Doc };
});