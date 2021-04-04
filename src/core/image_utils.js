define([
    '../shared/util.js',
    './primitives.js'
], function (a, b) {
    'use strict';
    class BaseLocalCache {
        constructor(options) {
            if (this.constructor === BaseLocalCache) {
                a.unreachable('Cannot initialize BaseLocalCache.');
            }
            if (!options || !options.onlyRefs) {
                this._nameRefMap = new Map();
                this._imageMap = new Map();
            }
            this._imageCache = new b.RefSetCache();
        }
        getByName(name) {
            const ref = this._nameRefMap.get(name);
            if (ref) {
                return this.getByRef(ref);
            }
            return this._imageMap.get(name) || null;
        }
        getByRef(ref) {
            return this._imageCache.get(ref) || null;
        }
        set(name, ref, data) {
            a.unreachable('Abstract method `set` called.');
        }
    }
    class LocalImageCache extends BaseLocalCache {
        set(name, ref = null, data) {
            if (!name) {
                throw new Error('LocalImageCache.set - expected "name" argument.');
            }
            if (ref) {
                if (this._imageCache.has(ref)) {
                    return;
                }
                this._nameRefMap.set(name, ref);
                this._imageCache.put(ref, data);
                return;
            }
            if (this._imageMap.has(name)) {
                return;
            }
            this._imageMap.set(name, data);
        }
    }
    class LocalColorSpaceCache extends BaseLocalCache {
        set(name = null, ref = null, data) {
            if (!name && !ref) {
                throw new Error('LocalColorSpaceCache.set - expected "name" and/or "ref" argument.');
            }
            if (ref) {
                if (this._imageCache.has(ref)) {
                    return;
                }
                if (name) {
                    this._nameRefMap.set(name, ref);
                }
                this._imageCache.put(ref, data);
                return;
            }
            if (this._imageMap.has(name)) {
                return;
            }
            this._imageMap.set(name, data);
        }
    }
    class LocalFunctionCache extends BaseLocalCache {
        constructor(options) {
            super({ onlyRefs: true });
        }
        getByName(name) {
            a.unreachable('Should not call `getByName` method.');
        }
        set(name = null, ref, data) {
            if (!ref) {
                throw new Error('LocalFunctionCache.set - expected "ref" argument.');
            }
            if (this._imageCache.has(ref)) {
                return;
            }
            this._imageCache.put(ref, data);
        }
    }
    class LocalGStateCache extends BaseLocalCache {
        set(name, ref = null, data) {
            if (!name) {
                throw new Error('LocalGStateCache.set - expected "name" argument.');
            }
            if (ref) {
                if (this._imageCache.has(ref)) {
                    return;
                }
                this._nameRefMap.set(name, ref);
                this._imageCache.put(ref, data);
                return;
            }
            if (this._imageMap.has(name)) {
                return;
            }
            this._imageMap.set(name, data);
        }
    }
    class LocalTilingPatternCache extends BaseLocalCache {
        set(name, ref = null, data) {
            if (!name) {
                throw new Error('LocalTilingPatternCache.set - expected "name" argument.');
            }
            if (ref) {
                if (this._imageCache.has(ref)) {
                    return;
                }
                this._nameRefMap.set(name, ref);
                this._imageCache.put(ref, data);
                return;
            }
            if (this._imageMap.has(name)) {
                return;
            }
            this._imageMap.set(name, data);
        }
    }
    class GlobalImageCache {
        static get NUM_PAGES_THRESHOLD() {
            return a.shadow(this, 'NUM_PAGES_THRESHOLD', 2);
        }
        static get MAX_IMAGES_TO_CACHE() {
            return a.shadow(this, 'MAX_IMAGES_TO_CACHE', 10);
        }
        constructor() {
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                a.assert(GlobalImageCache.NUM_PAGES_THRESHOLD > 1, 'GlobalImageCache - invalid NUM_PAGES_THRESHOLD constant.');
            }
            this._refCache = new b.RefSetCache();
            this._imageCache = new b.RefSetCache();
        }
        shouldCache(ref, pageIndex) {
            const pageIndexSet = this._refCache.get(ref);
            const numPages = pageIndexSet ? pageIndexSet.size + (pageIndexSet.has(pageIndex) ? 0 : 1) : 1;
            if (numPages < GlobalImageCache.NUM_PAGES_THRESHOLD) {
                return false;
            }
            if (!this._imageCache.has(ref) && this._imageCache.size >= GlobalImageCache.MAX_IMAGES_TO_CACHE) {
                return false;
            }
            return true;
        }
        addPageIndex(ref, pageIndex) {
            let pageIndexSet = this._refCache.get(ref);
            if (!pageIndexSet) {
                pageIndexSet = new Set();
                this._refCache.put(ref, pageIndexSet);
            }
            pageIndexSet.add(pageIndex);
        }
        getData(ref, pageIndex) {
            const pageIndexSet = this._refCache.get(ref);
            if (!pageIndexSet) {
                return null;
            }
            if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
                return null;
            }
            if (!this._imageCache.has(ref)) {
                return null;
            }
            pageIndexSet.add(pageIndex);
            return this._imageCache.get(ref);
        }
        setData(ref, data) {
            if (!this._refCache.has(ref)) {
                throw new Error('GlobalImageCache.setData - expected "addPageIndex" to have been called.');
            }
            if (this._imageCache.has(ref)) {
                return;
            }
            if (this._imageCache.size >= GlobalImageCache.MAX_IMAGES_TO_CACHE) {
                a.info('GlobalImageCache.setData - ignoring image above MAX_IMAGES_TO_CACHE.');
                return;
            }
            this._imageCache.put(ref, data);
        }
        clear(onlyData = false) {
            if (!onlyData) {
                this._refCache.clear();
            }
            this._imageCache.clear();
        }
    }
    return {
        GlobalImageCache,
        LocalColorSpaceCache,
        LocalFunctionCache,
        LocalGStateCache,
        LocalImageCache,
        LocalTilingPatternCache
    };
});