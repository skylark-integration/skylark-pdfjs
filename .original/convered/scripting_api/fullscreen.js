define([
    './constants.js',
    './pdf_object.js'
], function (a, b) {
    'use strict';
    class FullScreen extends b.PDFObject {
        constructor(data) {
            super(data);
            this._backgroundColor = [];
            this._clickAdvances = true;
            this._cursor = a.Cursor.hidden;
            this._defaultTransition = '';
            this._escapeExits = true;
            this._isFullScreen = true;
            this._loop = false;
            this._timeDelay = 3600;
            this._usePageTiming = false;
            this._useTimer = false;
        }
        get backgroundColor() {
            return this._backgroundColor;
        }
        set backgroundColor(_) {
        }
        get clickAdvances() {
            return this._clickAdvances;
        }
        set clickAdvances(_) {
        }
        get cursor() {
            return this._cursor;
        }
        set cursor(_) {
        }
        get defaultTransition() {
            return this._defaultTransition;
        }
        set defaultTransition(_) {
        }
        get escapeExits() {
            return this._escapeExits;
        }
        set escapeExits(_) {
        }
        get isFullScreen() {
            return this._isFullScreen;
        }
        set isFullScreen(_) {
        }
        get loop() {
            return this._loop;
        }
        set loop(_) {
        }
        get timeDelay() {
            return this._timeDelay;
        }
        set timeDelay(_) {
        }
        get transitions() {
            return [
                'Replace',
                'WipeRight',
                'WipeLeft',
                'WipeDown',
                'WipeUp',
                'SplitHorizontalIn',
                'SplitHorizontalOut',
                'SplitVerticalIn',
                'SplitVerticalOut',
                'BlindsHorizontal',
                'BlindsVertical',
                'BoxIn',
                'BoxOut',
                'GlitterRight',
                'GlitterDown',
                'GlitterRightDown',
                'Dissolve',
                'Random'
            ];
        }
        set transitions(_) {
            throw new Error('fullscreen.transitions is read-only');
        }
        get usePageTiming() {
            return this._usePageTiming;
        }
        set usePageTiming(_) {
        }
        get useTimer() {
            return this._useTimer;
        }
        set useTimer(_) {
        }
    }
    return { FullScreen };
});