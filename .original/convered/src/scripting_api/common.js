define(function () {
    'use strict';
    function createActionsMap(actions) {
        const actionsMap = new Map();
        if (actions) {
            for (const [eventType, actionsForEvent] of Object.entries(actions)) {
                actionsMap.set(eventType, actionsForEvent);
            }
        }
        return actionsMap;
    }
    return { createActionsMap };
});