var C = require('./constants.js'),
    SystemError = require('./errors.js').SystemError;

var is = {};

// FIXME: rename all to full-names
is.defined = function(v) {
  return !((typeof v === 'undefined') ||
    (v === null) ||
    (v === undefined));
};
is.finite = global.isFinite;
is.nan = global.isNaN;
is.arr = Array.isArray;
is.integer = function(n) {
    return is.num(n) && Math.floor(n) == n;
};
is.num = function(n) {
    n = global.parseFloat(n);
    return !is.nan(n) && is.finite(n);
};
is.fun = function(f) {
    return typeof f === 'function';
};
is.obj = function(o) {
    return typeof o === 'object';
};
is.str = function(s) {
    return typeof s === 'string';
};
is.not_empty = function(obj) {
    if (Object.keys) return (Object.keys(obj).length > 0);
    else return (Object.getOwnPropertyNames(obj).length > 0);
};

is.modifier = function(v) {
    return (v instanceof anm.Modifier);
};
is.painter = function(v) {
    return (v instanceof anm.Painter);
};
is.tween = function(v) {
    return is.modifier(v) && v.is_tween;
};

is.equal = function(x, y) {
    if (x === y) return true;
    // if both x and y are null or undefined and exactly the same

    if (!(x instanceof Object) || !(y instanceof Object)) return false;
    // if they are not strictly equal, they both need to be Objects

    if (x.constructor !== y.constructor) return false;
    // they must have the exact same prototype chain, the closest we can do is
    // test their constructor.

    for (var p in x) {
        if (!x.hasOwnProperty(p)) continue;
        // other properties were tested using x.constructor === y.constructor

        if (!y.hasOwnProperty(p)) return false;
        // allows to compare x[p] and y[p] when set to undefined

        if (x[p] === y[p]) continue;
        // if they have the same strict value or identity then they are equal

        if (typeof( x[p]) !== "object") return false;
        // Numbers, Strings, Functions, Booleans must be strictly equal

        if (!is.equal( x[p],  y[p])) return false;
        // Objects and Arrays must be tested recursively
    }

    for (p in y) {
        if ( y.hasOwnProperty(p) && ! x.hasOwnProperty(p)) return false;
        // allows x[p] to be set to undefined
    }
    return true;
};

// Iterator
// -----------------------------------------------------------------------------

function StopIteration() {}
function iter(a) {
    if (a.__iter) {
        a.__iter.reset();
        return a.__iter;
    }
    var pos = 0,
        len = a.length;
    return (a.__iter = {
        next: function() {
                  if (pos < len) return a[pos++];
                  pos = 0;
                  throw new StopIteration();
              },
        hasNext: function() { return (pos < len); },
        remove: function() { len--; return a.splice(--pos, 1); },
        reset: function() { pos = 0; len = a.length; },
        get: function() { return a[pos]; },
        each: function(f, rf) {
                  this.reset();
                  while (this.hasNext()) {
                    if (f(this.next()) === false) {
                        if (rf) rf(this.remove()); else this.remove();
                    }
                  }
              }
    });
}

function keys(obj, f) {
    // TODO: grep -r ./src -e "var .* in" -> use everywhere?
    if (Object.keys) {
        var ids = Object.keys(obj);
        for (var i = 0; i < ids.length; i++) {
            if (f(ids[i], obj[ids[i]]) === false) break;
        }
    } else {
        for (var id in obj) {
            if (f(id, obj[id]) === false) break;
        };
    }
}

function fmt_time(time) {
    if (!is.finite(time)) return '∞';
    var absTime = Math.abs(time),
        h = Math.floor(absTime / 3600),
        m = Math.floor((absTime - (h * 3600)) / 60),
        s = Math.floor(absTime - (h * 3600) - (m * 60));

    return ((time < 0) ? '-' : '') +
            ((h > 0)  ? (((h < 10) ? ('0' + h) : h) + ':') : '') +
            ((m < 10) ? ('0' + m) : m) + ':' +
            ((s < 10) ? ('0' + s) : s);
}

function ell_text(text, max_len) {
    if (!text) return '';
    var len = text.length;
    if (len <= max_len) return text;
    var semilen = Math.floor(len / 2) - 2;
    return text.slice(0, semilen) + '...' +
         text.slice(len - semilen);
}

// ### Internal Helpers
/* -------------------- */

// #### mathematics

function compareFloat(n1, n2, precision) {
    if (precision !== 0) {
        precision = precision || 2;
    }
    var multiplier = Math.pow(10, precision);
    return Math.round(n1 * multiplier) ==
           Math.round(n2 * multiplier);
}

function roundTo(n, precision) {
    if (!precision) return Math.round(n);
    //return n.toPrecision(precision);
    var multiplier = Math.pow(10, precision);
    return Math.round(n * multiplier) / multiplier;
}

function interpolateFloat(a, b, t) {
    return a*(1-t)+b*t;
}

// #### other

function paramsToObj(pstr) {
    var o = {}, ps = pstr.split('&'), i = ps.length, pair;
    while (i--) { pair = ps[i].split('='); o[pair[0]] = pair[1]; }
    return o;
}

// for one-level objects, so no hasOwnProperty check
function obj_clone(what) {
    var dest = {};
    for (var prop in what) {
        dest[prop] = what[prop];
    }
    return dest;
}

function mrg_obj(src, backup, trg) {
    if (!backup) return src;
    var res = trg || {};
    for (var prop in backup) {
        res[prop] = is.defined(src[prop]) ? src[prop] : backup[prop]; }
    return res;
}

function strf(str, subst) {
    var args = subst;
    return str.replace(/{(\d+)}/g, function(match, number) {
      return is.defined(args[number]) ?
        args[number] : match;
    });
}

function guid() {
   return Math.random().toString(36).substring(2, 10) +
          Math.random().toString(36).substring(2, 10);
}

function fit_rects(pw, ph, aw, ah) {
    // pw == player width, ph == player height
    // aw == anim width,   ah == anim height
    var xw = pw / aw,
        xh = ph / ah;
    var factor = Math.min(xw, xh);
    var hcoord = (pw - aw * factor) / 2,
        vcoord = (ph - ah * factor) / 2,
        awf = aw * factor,
        ahf = ah * factor;
    if ((xw != 1) || (xh != 1)) {
        var anim_rect = [ hcoord, vcoord, awf, ahf ];
        if (hcoord !== 0) {
            return [ factor,
                     anim_rect,
                     [ 0, 0, hcoord, ph ],
                     [ hcoord + awf, 0, hcoord, ph ] ];
        } else if (vcoord !== 0) {
            return [ factor,
                     anim_rect,
                     [ 0, 0, aw, vcoord ],
                     [ 0, vcoord + ahf, aw, vcoord ] ];
        } else return [ factor, anim_rect ];
    } else return [ 1, [ 0, 0, aw, ah ] ];
}

function removeElement(obj, element) {
    if (is.arr(obj)) {
        var index = obj.indexOf(element);
        if (index > -1) {
            obj.splice(index, 1);
        }
    } else {
        obj[element] = null;
    }
}

function postpone(fn) {
    //run the code after the event loop is done with whatever it is
    //occupied with at the moment
    setTimeout(fn, 0);
}

function makeApiUrl(prefix, path, loadSrc) {
    var prodHost = 'animatron.com',
        testHost = 'animatron-test.com',
        prodStatUrl = '//' + prefix + '.' + prodHost + path,
        testStatUrl = '//' + prefix + '.' + testHost + path,
        locatedAtTest = false,
        locatedAtProd = false;
    if (typeof loadSrc === 'string') {
        //if the player was loaded from a snapshot URL, we check the said url
        //to see if it is from our servers
        locatedAtTest = loadSrc.indexOf(testHost) !== -1;
        locatedAtProd = loadSrc.indexOf(prodHost) !== -1;
    } else if (window && window.location) {
        //otherwise, we check if we are on an Animatron's webpage
        var hostname = window.location.hostname;
        locatedAtTest = hostname.indexOf(testHost) !== -1;
        locatedAtProd = hostname.indexOf(prodHost) !== -1;
    }
    if (locatedAtTest) {
        return testStatUrl;
    } else if (locatedAtProd) {
        return prodStatUrl;
    }
}

function getObjectId () {
    var timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
}

// TODO: add array cloning

module.exports = {
    fmt_time: fmt_time,
    ell_text: ell_text,
    compareFloat: compareFloat,
    roundTo: roundTo,
    interpolateFloat: interpolateFloat,
    paramsToObj: paramsToObj,
    obj_clone: obj_clone,
    mrg_obj: mrg_obj,
    strf: strf,
    guid: guid,
    fit_rects: fit_rects,
    is: is,
    iter: iter,
    keys: keys,
    removeElement: removeElement,
    postpone: postpone,
    makeApiUrl: makeApiUrl,
    getObjectId: getObjectId
};
