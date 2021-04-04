define(['./pdf_object.js'], function (a) {
    'use strict';
    class Thermometer extends a.PDFObject {
        constructor(data) {
            super(data);
            this._cancelled = false;
            this._duration = 100;
            this._text = '';
            this._value = 0;
        }
        get cancelled() {
            return this._cancelled;
        }
        set cancelled(_) {
            throw new Error('thermometer.cancelled is read-only');
        }
        get duration() {
            return this._duration;
        }
        set duration(val) {
            this._duration = val;
        }
        get text() {
            return this._text;
        }
        set text(val) {
            this._text = val;
        }
        get value() {
            return this._value;
        }
        set value(val) {
            this._value = val;
        }
        begin() {
        }
        end() {
        }
    }
    return { Thermometer };
});