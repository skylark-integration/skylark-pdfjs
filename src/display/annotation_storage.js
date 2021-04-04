define(['../shared/util.js'], function (a) {
    'use strict';
    class AnnotationStorage {
        constructor() {
            this._storage = new Map();
            this._modified = false;
            this.onSetModified = null;
            this.onResetModified = null;
        }
        getOrCreateValue(key, defaultValue) {
            if (this._storage.has(key)) {
                return this._storage.get(key);
            }
            this._storage.set(key, defaultValue);
            return defaultValue;
        }
        setValue(key, value) {
            const obj = this._storage.get(key);
            let modified = false;
            if (obj !== undefined) {
                for (const [entry, val] of Object.entries(value)) {
                    if (obj[entry] !== val) {
                        modified = true;
                        obj[entry] = val;
                    }
                }
            } else {
                this._storage.set(key, value);
                modified = true;
            }
            if (modified) {
                this._setModified();
            }
        }
        getAll() {
            if (this._storage.size === 0) {
                return null;
            }
            return a.objectFromEntries(this._storage);
        }
        get size() {
            return this._storage.size;
        }
        _setModified() {
            if (!this._modified) {
                this._modified = true;
                if (typeof this.onSetModified === 'function') {
                    this.onSetModified();
                }
            }
        }
        resetModified() {
            if (this._modified) {
                this._modified = false;
                if (typeof this.onResetModified === 'function') {
                    this.onResetModified();
                }
            }
        }
    }
    return { AnnotationStorage };
});