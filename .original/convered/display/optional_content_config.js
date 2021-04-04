define(['../shared/util.js'], function (a) {
    'use strict';
    class OptionalContentGroup {
        constructor(name, intent) {
            this.visible = true;
            this.name = name;
            this.intent = intent;
        }
    }
    class OptionalContentConfig {
        constructor(data) {
            this.name = null;
            this.creator = null;
            this._order = null;
            this._groups = new Map();
            if (data === null) {
                return;
            }
            this.name = data.name;
            this.creator = data.creator;
            this._order = data.order;
            for (const group of data.groups) {
                this._groups.set(group.id, new OptionalContentGroup(group.name, group.intent));
            }
            if (data.baseState === 'OFF') {
                for (const group of this._groups) {
                    group.visible = false;
                }
            }
            for (const on of data.on) {
                this._groups.get(on).visible = true;
            }
            for (const off of data.off) {
                this._groups.get(off).visible = false;
            }
        }
        isVisible(group) {
            if (group.type === 'OCG') {
                if (!this._groups.has(group.id)) {
                    a.warn(`Optional content group not found: ${ group.id }`);
                    return true;
                }
                return this._groups.get(group.id).visible;
            } else if (group.type === 'OCMD') {
                if (group.expression) {
                    a.warn('Visibility expression not supported yet.');
                }
                if (!group.policy || group.policy === 'AnyOn') {
                    for (const id of group.ids) {
                        if (!this._groups.has(id)) {
                            a.warn(`Optional content group not found: ${ id }`);
                            return true;
                        }
                        if (this._groups.get(id).visible) {
                            return true;
                        }
                    }
                    return false;
                } else if (group.policy === 'AllOn') {
                    for (const id of group.ids) {
                        if (!this._groups.has(id)) {
                            a.warn(`Optional content group not found: ${ id }`);
                            return true;
                        }
                        if (!this._groups.get(id).visible) {
                            return false;
                        }
                    }
                    return true;
                } else if (group.policy === 'AnyOff') {
                    for (const id of group.ids) {
                        if (!this._groups.has(id)) {
                            a.warn(`Optional content group not found: ${ id }`);
                            return true;
                        }
                        if (!this._groups.get(id).visible) {
                            return true;
                        }
                    }
                    return false;
                } else if (group.policy === 'AllOff') {
                    for (const id of group.ids) {
                        if (!this._groups.has(id)) {
                            a.warn(`Optional content group not found: ${ id }`);
                            return true;
                        }
                        if (this._groups.get(id).visible) {
                            return false;
                        }
                    }
                    return true;
                }
                a.warn(`Unknown optional content policy ${ group.policy }.`);
                return true;
            }
            a.warn(`Unknown group type ${ group.type }.`);
            return true;
        }
        setVisibility(id, visible = true) {
            if (!this._groups.has(id)) {
                a.warn(`Optional content group not found: ${ id }`);
                return;
            }
            this._groups.get(id).visible = !!visible;
        }
        getOrder() {
            if (!this._groups.size) {
                return null;
            }
            if (this._order) {
                return this._order.slice();
            }
            return Array.from(this._groups.keys());
        }
        getGroups() {
            if (!this._groups.size) {
                return null;
            }
            return a.objectFromEntries(this._groups);
        }
        getGroup(id) {
            return this._groups.get(id) || null;
        }
    }
    return { OptionalContentConfig };
});