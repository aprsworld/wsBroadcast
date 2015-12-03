/* Object.js
 *
 * CURRENTLY THE APIs ARE SUBJECT TO CHANGE.  DO NOT USE IN PRODUCTION CODE.
 *
 * A collection of utilities to make up for lacking functionality in the
 * various standards and implementations.
 *
 * Notes:
 *	Eventually these functions will be Object.prototype.Merge and similiar.
 *
 * Standards:
 *	Should comply with ECMA3 and work with all JavaScript implementations
 *	claiming compliance with that or future standards (at this time
 *	ECMAScript 2015 [ECMA6/ECMA Harmony]).
 */


/*
 * object_traverse(obj, handler)
 *
 * Traverses a structure of Objects and calls the handler for each sub-object.
 *
 * callback(obj):
 *	Return false to stop traversal.
 *
 * Return Value:
 *	Does not return a value.
 */
function object_traverse(obj, callback) {

    // If the callback returns false, return.
    if (callback(obj) == false) {
        return;
    }

    // Is this actually an object?
    if (!obj || typeof obj !== 'object') {
        return;
    }

    // Traverse properties
    // XXX: Handle non-enumerable properties, etc
    var p;
    for (p in obj) {
        object_traverse(obj[p], callback);
    }
}


/*
 * object_merge(target, obj0, .... objn)
 *
 * Merges all objects or primatives into dst in order of appearance.  It will
 * intentionally ignore any properties that are explicitly set to undefined.
 * It does a 'deep merge' and will leave as much of the dst object intact.
 * Attempts to handle self-referencing structures (XXX: Needs thought and work).
 *
 * Return Value:
 *	Returns undefined if no arguments are passed in.
 *	If the last non undefined argument is a primative, it will return that.
 *	If a primative is passed in anywhere else it will return a merged clone.
 *	Otherwise it returns target with all the remaining arguments merged in.
 *
 * Hooks:
 *	before(prop, dst, src): Called for each property after checking to make  *		sure the dst and src properties are not the same and that the
 *		src property is not a reference to the target (in which
 *		case in which case the property is just set to src). prop is
 *		the name of the property.  The return value is what is merged
 *		which normally should be src, but can be something else.
 *	after(prop, clone, merge): Called after processing each property.
 *		The return value is what the property is actually assigned.
 *	XXX: The merging of target and obj0 through objn currently do not
 *		have any hooks.
 *
 */
var object_merge_hooks = {
    before: function(prop, dst, src) { return src; },
    after: function(prop, dst, src) { return dst; }
};

function object_merge () {
    "use strict";
    var length = arguments.length;
    var target = arguments[0];
    var hooks = object_merge_hooks;
    var last; // If this is defined, return it instead of target

    // Can't merge less than 2 objects
    if (length < 2) {
        if (length == 1) {
            return target;
        }
        return undefined;
    }

    // Determine if the target is object is suitable for merging
    if (!target || typeof target !== 'object') {
        last = target;
        target = {};
    }

    // XXX: BUG: How to properly handle Arrays and "Functions"?

    // Merge all the arguments...
    for (var i = 1; i < length; i++) {
        var extension = arguments[i];

        // Ignore extension if it's undefined or the same as the target
        if (extension === undefined || extension === target) {
            continue;
        }

        // Call hook before processing object
        //extension = hooks.before(extension); // XXX: Seperate hook?

        // Handle extensions that are not objects
        if (!extension || typeof extension !== 'object') {
            target = {};
            last = extension;
            continue;
        }
        last = undefined;

        // Cycle through all the properties
        for (var prop in extension) {
            var src = extension[prop];
            var dst = target[prop];

            // Continue if the src and dst are the same
            if (src === dst) {
                continue;
            }

            // Properly handle self-referencing structures
            // XXX: Figure this out...
            if (src === target) {
                target[prop] = target;
                continue;
            }

            // Call hook before processing object
            var merge = hooks.before(prop, dst, src);

            // Merge
            var clone = dst;
            if (dst && typeof dst === 'object') {
                clone = object_merge(dst, merge);
            } else {
                clone = merge;
            }

            // Call hook after processing object
            merge = hooks.after(prop, clone, merge);

            // Update the property
            if (merge !== undefined && (!dst || typeof dst !== 'object')) {
                target[prop] = merge;
            }
        }

        // Call hook after processing object
        //last = hooks.after(extension); // XXX: Seperate hook?
    }

    // The last extension was not an object, so return that value
    if (last !== undefined)
        return last;

    // Return the target object
    return target;
}

exports = module.exports;
exports.object_traverse = object_traverse;
exports.object_merge = object_merge;
exports.object_merge_hooks = object_merge_hooks;