define([
    './color.js',
    './event.js',
    './fullscreen.js',
    './pdf_object.js',
    './thermometer.js'
], function (a, b, c, d, e) {
    'use strict';
    const VIEWER_TYPE = 'PDF.js';
    const VIEWER_VARIATION = 'Full';
    const VIEWER_VERSION = '10.0';
    const FORMS_VERSION = undefined;
    class App extends d.PDFObject {
        constructor(data) {
            super(data);
            this.calculate = true;
            this._constants = null;
            this._focusRect = true;
            this._fs = null;
            this._language = App._getLanguage(data.language);
            this._openInPlace = false;
            this._platform = App._getPlatform(data.platform);
            this._runtimeHighlight = false;
            this._runtimeHighlightColor = ['T'];
            this._thermometer = null;
            this._toolbar = false;
            this._document = data._document;
            this._proxyHandler = data.proxyHandler;
            this._objects = Object.create(null);
            this._eventDispatcher = new b.EventDispatcher(this._document, data.calculationOrder, this._objects);
            this._timeoutIds = new WeakMap();
            if (typeof FinalizationRegistry !== 'undefined') {
                this._timeoutIdsRegistry = new FinalizationRegistry(this._cleanTimeout.bind(this));
            } else {
                this._timeoutIdsRegistry = null;
            }
            this._timeoutCallbackIds = new Map();
            this._timeoutCallbackId = 0;
            this._globalEval = data.globalEval;
            this._externalCall = data.externalCall;
        }
        _dispatchEvent(pdfEvent) {
            this._eventDispatcher.dispatch(pdfEvent);
        }
        _registerTimeoutCallback(cExpr) {
            const id = this._timeoutCallbackId++;
            this._timeoutCallbackIds.set(id, cExpr);
            return id;
        }
        _unregisterTimeoutCallback(id) {
            this._timeoutCallbackIds.delete(id);
        }
        _evalCallback({callbackId, interval}) {
            const expr = this._timeoutCallbackIds.get(callbackId);
            if (!interval) {
                this._unregisterTimeoutCallback(callbackId);
            }
            if (expr) {
                this._globalEval(expr);
            }
        }
        _registerTimeout(callbackId, interval) {
            const timeout = Object.create(null);
            const id = {
                callbackId,
                interval
            };
            this._timeoutIds.set(timeout, id);
            if (this._timeoutIdsRegistry) {
                this._timeoutIdsRegistry.register(timeout, id);
            }
            return timeout;
        }
        _unregisterTimeout(timeout) {
            if (this._timeoutIdsRegistry) {
                this._timeoutIdsRegistry.unregister(timeout);
            }
            const data = this._timeoutIds.get(timeout);
            if (!data) {
                return;
            }
            this._timeoutIds.delete(timeout);
            this._cleanTimeout(data);
        }
        _cleanTimeout({callbackId, interval}) {
            this._unregisterTimeoutCallback(callbackId);
            if (interval) {
                this._externalCall('clearInterval', [callbackId]);
            } else {
                this._externalCall('clearTimeout', [callbackId]);
            }
        }
        static _getPlatform(platform) {
            if (typeof platform === 'string') {
                platform = platform.toLowerCase();
                if (platform.includes('win')) {
                    return 'WIN';
                } else if (platform.includes('mac')) {
                    return 'MAC';
                }
            }
            return 'UNIX';
        }
        static _getLanguage(language) {
            const [main, sub] = language.toLowerCase().split(/[-_]/);
            switch (main) {
            case 'zh':
                if (sub === 'cn' || sub === 'sg') {
                    return 'CHS';
                }
                return 'CHT';
            case 'da':
                return 'DAN';
            case 'de':
                return 'DEU';
            case 'es':
                return 'ESP';
            case 'fr':
                return 'FRA';
            case 'it':
                return 'ITA';
            case 'ko':
                return 'KOR';
            case 'ja':
                return 'JPN';
            case 'nl':
                return 'NLD';
            case 'no':
                return 'NOR';
            case 'pt':
                if (sub === 'br') {
                    return 'PTB';
                }
                return 'ENU';
            case 'fi':
                return 'SUO';
            case 'SV':
                return 'SVE';
            default:
                return 'ENU';
            }
        }
        get activeDocs() {
            return [this._document.wrapped];
        }
        set activeDocs(_) {
            throw new Error('app.activeDocs is read-only');
        }
        get constants() {
            if (!this._constants) {
                this._constants = Object.freeze({
                    align: Object.freeze({
                        left: 0,
                        center: 1,
                        right: 2,
                        top: 3,
                        bottom: 4
                    })
                });
            }
            return this._constants;
        }
        set constants(_) {
            throw new Error('app.constants is read-only');
        }
        get focusRect() {
            return this._focusRect;
        }
        set focusRect(val) {
            this._focusRect = val;
        }
        get formsVersion() {
            return FORMS_VERSION;
        }
        set formsVersion(_) {
            throw new Error('app.formsVersion is read-only');
        }
        get fromPDFConverters() {
            return [];
        }
        set fromPDFConverters(_) {
            throw new Error('app.fromPDFConverters is read-only');
        }
        get fs() {
            if (this._fs === null) {
                this._fs = new Proxy(new c.FullScreen({ send: this._send }), this._proxyHandler);
            }
            return this._fs;
        }
        set fs(_) {
            throw new Error('app.fs is read-only');
        }
        get language() {
            return this._language;
        }
        set language(_) {
            throw new Error('app.language is read-only');
        }
        get media() {
            return undefined;
        }
        set media(_) {
            throw new Error('app.media is read-only');
        }
        get monitors() {
            return [];
        }
        set monitors(_) {
            throw new Error('app.monitors is read-only');
        }
        get numPlugins() {
            return 0;
        }
        set numPlugins(_) {
            throw new Error('app.numPlugins is read-only');
        }
        get openInPlace() {
            return this._openInPlace;
        }
        set openInPlace(val) {
            this._openInPlace = val;
        }
        get platform() {
            return this._platform;
        }
        set platform(_) {
            throw new Error('app.platform is read-only');
        }
        get plugins() {
            return [];
        }
        set plugins(_) {
            throw new Error('app.plugins is read-only');
        }
        get printColorProfiles() {
            return [];
        }
        set printColorProfiles(_) {
            throw new Error('app.printColorProfiles is read-only');
        }
        get printerNames() {
            return [];
        }
        set printerNames(_) {
            throw new Error('app.printerNames is read-only');
        }
        get runtimeHighlight() {
            return this._runtimeHighlight;
        }
        set runtimeHighlight(val) {
            this._runtimeHighlight = val;
        }
        get runtimeHighlightColor() {
            return this._runtimeHighlightColor;
        }
        set runtimeHighlightColor(val) {
            if (a.Color._isValidColor(val)) {
                this._runtimeHighlightColor = val;
            }
        }
        get thermometer() {
            if (this._thermometer === null) {
                this._thermometer = new Proxy(new e.Thermometer({ send: this._send }), this._proxyHandler);
            }
            return this._thermometer;
        }
        set thermometer(_) {
            throw new Error('app.thermometer is read-only');
        }
        get toolbar() {
            return this._toolbar;
        }
        set toolbar(val) {
            this._toolbar = val;
        }
        get toolbarHorizontal() {
            return this.toolbar;
        }
        set toolbarHorizontal(value) {
            this.toolbar = value;
        }
        get toolbarVertical() {
            return this.toolbar;
        }
        set toolbarVertical(value) {
            this.toolbar = value;
        }
        get viewerType() {
            return VIEWER_TYPE;
        }
        set viewerType(_) {
            throw new Error('app.viewerType is read-only');
        }
        get viewerVariation() {
            return VIEWER_VARIATION;
        }
        set viewerVariation(_) {
            throw new Error('app.viewerVariation is read-only');
        }
        get viewerVersion() {
            return VIEWER_VERSION;
        }
        set viewerVersion(_) {
            throw new Error('app.viewerVersion is read-only');
        }
        addMenuItem() {
        }
        addSubMenu() {
        }
        addToolButton() {
        }
        alert(cMsg, nIcon = 0, nType = 0, cTitle = 'PDF.js', oDoc = null, oCheckbox = null) {
            this._externalCall('alert', [cMsg]);
        }
        beep() {
        }
        beginPriv() {
        }
        browseForDoc() {
        }
        clearInterval(oInterval) {
            this._unregisterTimeout(oInterval);
        }
        clearTimeOut(oTime) {
            this._unregisterTimeout(oTime);
        }
        endPriv() {
        }
        execDialog() {
        }
        execMenuItem() {
        }
        getNthPlugInName() {
        }
        getPath() {
        }
        goBack() {
        }
        goForward() {
        }
        hideMenuItem() {
        }
        hideToolbarButton() {
        }
        launchURL() {
        }
        listMenuItems() {
        }
        listToolbarButtons() {
        }
        loadPolicyFile() {
        }
        mailGetAddrs() {
        }
        mailMsg() {
        }
        newDoc() {
        }
        newCollection() {
        }
        newFDF() {
        }
        openDoc() {
        }
        openFDF() {
        }
        popUpMenu() {
        }
        popUpMenuEx() {
        }
        removeToolButton() {
        }
        response(cQuestion, cTitle = '', cDefault = '', bPassword = '', cLabel = '') {
            return this._externalCall('prompt', [
                cQuestion,
                cDefault || ''
            ]);
        }
        setInterval(cExpr, nMilliseconds) {
            if (typeof cExpr !== 'string') {
                throw new TypeError('First argument of app.setInterval must be a string');
            }
            if (typeof nMilliseconds !== 'number') {
                throw new TypeError('Second argument of app.setInterval must be a number');
            }
            const callbackId = this._registerTimeoutCallback(cExpr);
            this._externalCall('setInterval', [
                callbackId,
                nMilliseconds
            ]);
            return this._registerTimeout(callbackId, true);
        }
        setTimeOut(cExpr, nMilliseconds) {
            if (typeof cExpr !== 'string') {
                throw new TypeError('First argument of app.setTimeOut must be a string');
            }
            if (typeof nMilliseconds !== 'number') {
                throw new TypeError('Second argument of app.setTimeOut must be a number');
            }
            const callbackId = this._registerTimeoutCallback(cExpr);
            this._externalCall('setTimeout', [
                callbackId,
                nMilliseconds
            ]);
            return this._registerTimeout(callbackId, false);
        }
        trustedFunction() {
        }
        trustPropagatorFunction() {
        }
    }
    return { App };
});