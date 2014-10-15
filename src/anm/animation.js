var C = require('./constants.js'),
    engine = require('engine'),
    Element = require('./element.js'),
    Clip = Element,
    Brush = require('./brush.js'),
    provideEvents = require('./events.js').provideEvents,
    AnimationError = require('./errors.js').AnimationError,
    Errors = require('./loc.js').Errors,
    ResMan = require('./resource_manager.js'),
    FontDetector = require('../vendor/font_detector.js'),
    utils = require('./utils.js'),
    is = utils.is,
    iter = utils.iter;


/* X_ERROR, X_FOCUS, X_RESIZE, X_SELECT, touch events */

var DOM_TO_EVT_MAP = {
  'mouseup':   C.X_MUP,
  'mousedown': C.X_MDOWN,
  'mousemove': C.X_MMOVE,
  'mouseover': C.X_MOVER,
  'mouseout':  C.X_MOUT,
  'click':     C.X_MCLICK,
  'dblclick':  C.X_MDCLICK,
  'keyup':     C.X_KUP,
  'keydown':   C.X_KDOWN,
  'keypress':  C.X_KPRESS
};

// Animation
// -----------------------------------------------------------------------------

/**
 * @class anm.Animation
 *
 * @constructor
 */
function Animation() {
    this.id = utils.guid();
    this.tree = [];
    this.hash = {};
    this.name = '';
    this.duration = undefined;
    this.bgfill = null;
    this.width = undefined;
    this.height = undefined;
    this.zoom = 1.0;
    this.speed = 1.0;
    this.repeat = false;
    this.meta = {};
    //this.fps = undefined;
    this.__informEnabled = true;
    this._laters = [];
    this._initHandlers(); // TODO: make automatic
}

Animation.DEFAULT_DURATION = 10;

// mouse/keyboard events are assigned in L.loadAnimation
/* TODO: move them into animation */
provideEvents(Animation, [ C.X_MCLICK, C.X_MDCLICK, C.X_MUP, C.X_MDOWN,
                           C.X_MMOVE, C.X_MOVER, C.X_MOUT,
                           C.X_KPRESS, C.X_KUP, C.X_KDOWN,
                           C.X_DRAW,
                           // player events
                           C.S_CHANGE_STATE,
                           C.S_PLAY, C.S_PAUSE, C.S_STOP, C.S_COMPLETE, C.S_REPEAT,
                           C.S_IMPORT, C.S_LOAD, C.S_RES_LOAD, C.S_ERROR ]);
/* TODO: add chaining to all external Animation methods? */
// > Animation.add % (elem: Element | Clip)
// > Animation.add % (elems: Array[Element]) => Clip
// > Animation.add % (draw: Function(ctx: Context),
//                onframe: Function(time: Float),
//                [ transform: Function(ctx: Context,
//                                      prev: Function(Context)) ])
//                => Element
// > Animation.add % (element: Element)
Animation.prototype.add = function(arg1, arg2, arg3) {
    // this method only adds an element to a top-level
    // FIXME: allow to add elements deeper or rename this
    //        method to avoid confusion?
    if (arg2) { // element by functions mode
        var elm = new Element(arg1, arg2);
        if (arg3) elm.changeTransform(arg3);
        this.addToTree(elm);
        return elm;
    } else if (is.arr(arg1)) { // elements array mode
        var clip = new Clip();
        clip.add(arg1);
        this.addToTree(_clip);
        return clip;
    } else { // element object mode
        this.addToTree(arg1);
    }
}
/* addS allowed to add static element before, such as image, may be return it in some form? */
// > Animation.remove % (elm: Element)
Animation.prototype.remove = function(elm) {
    // error will be thrown in _unregister method
    //if (!this.hash[elm.id]) throw new AnimErr(Errors.A.ELEMENT_IS_NOT_REGISTERED);
    if (elm.parent) {
        // it will unregister element inside
        elm.parent.remove(elm);
    } else {
        this._unregister(elm);
    }
}
// > Animation.prototype.clear % ()
/* Animation.prototype.clear = function() {
    this.hash = {};
    this.tree = [];
    this.duration = 0;
    var hash = this.hash;
    this.hash = {};
    for (var elmId in hash) {
        hash[elm.id]._unbind(); // unsafe, because calls unregistering
    }
} */
// > Animation.visitElems % (visitor: Function(elm: Element))
Animation.prototype.visitElems = function(visitor, data) {
    for (var elmId in this.hash) {
        visitor(this.hash[elmId], data);
    }
}
Animation.prototype.travelChildren = Animation.prototype.visitElems;
// > Animation.visitRoots % (visitor: Function(elm: Element))
Animation.prototype.visitRoots = function(visitor, data) {
    for (var i = 0, tlen = this.tree.length; i < tlen; i++) {
        visitor(this.tree[i], data);
    }
}
Animation.prototype.visitChildren = Animation.prototype.visitRoots;
Animation.prototype.iterateRoots = function(func, rfunc) {
    iter(this.tree).each(func, rfunc);
}
Animation.prototype.render = function(ctx, time, dt) {
    ctx.save();
    var zoom = this.zoom;
    try {
        if (zoom != 1) {
            ctx.scale(zoom, zoom);
        }
        if (this.bgfill) {
            if (!this.bgfill instanceof Brush) this.bgfill = Brush.fill(this.bgfill);
            ctx.fillStyle = this.bgfill.apply(ctx);
            ctx.fillRect(0, 0, this.width, this.height);
        }
        this.visitRoots(function(elm) {
            elm.render(ctx, time, dt);
        });
    } finally { ctx.restore(); }
    this.fire(C.X_DRAW,ctx);
}
Animation.prototype.handle__x = function(type, evt) {
    this.visitElems(function(elm) {
        elm.fire(type, evt);
    });
    return true;
}
// TODO: test
Animation.prototype.getFittingDuration = function() {
    var max_pos = -Infinity;
    var me = this;
    this.visitRoots(function(elm) {
        var elm_tpos = elm._max_tpos();
        if (elm_tpos > max_pos) max_pos = elm_tpos;
    });
    return max_pos;
}
Animation.prototype.reset = function() {
    this.__informEnabled = true;
    this.visitRoots(function(elm) {
        elm.reset();
    });
}
Animation.prototype.dispose = function() {
    this.disposeHandlers();
    var me = this;
    /* FIXME: unregistering removes from tree, ensure it is safe */
    this.iterateRoots(function(elm) {
        me._unregister_no_rm(elm);
        elm.dispose();
        return false;
    });
}
Animation.prototype.isEmpty = function() {
    return this.tree.length == 0;
}
Animation.prototype.toString = function() {
    return "[ Animation "+(this.name ? "'"+this.name+"'" : "")+"]";
}
Animation.prototype.subscribeEvents = function(canvas) {
    engine.subscribeAnimationToEvents(canvas, this, DOM_TO_EVT_MAP);
}
Animation.prototype.unsubscribeEvents = function(canvas) {
    engine.unsubscribeAnimationFromEvents(canvas, this);
}
Animation.prototype.addToTree = function(elm) {
    if (!elm.children) {
        throw new AnimationError('It appears that it is not a clip object or element that you pass');
    }
    this._register(elm);
    /*if (elm.children) this._addElems(elm.children);*/
    this.tree.push(elm);
}
/*Animation.prototype._addElems = function(elems) {
    for (var ei = 0; ei < elems.length; ei++) {
        var _elm = elems[ei];
        this._register(_elm);
    }
}*/
Animation.prototype._register = function(elm) {
    if (this.hash[elm.id]) throw new AnimationError(Errors.A.ELEMENT_IS_REGISTERED);
    elm.registered = true;
    elm.anim = this;
    this.hash[elm.id] = elm;
    var me = this;
    elm.visitChildren(function(elm) {
        me._register(elm);
    });
}
Animation.prototype._unregister_no_rm = function(elm) {
    this._unregister(elm, true);
}
Animation.prototype._unregister = function(elm, save_in_tree) { // save_in_tree is optional and false by default
    if (!elm.registered) throw new AnimationError(Errors.A.ELEMENT_IS_NOT_REGISTERED);
    var me = this;
    elm.visitChildren(function(elm) {
        me._unregister(elm);
    });
    var pos = -1;
    if (!save_in_tree) {
      while ((pos = this.tree.indexOf(elm)) >= 0) {
        this.tree.splice(pos, 1); // FIXME: why it does not goes deeply in the tree?
      }
    }
    delete this.hash[elm.id];
    elm.registered = false;
    elm.anim = null;
    //elm.parent = null;
}
Animation.prototype._collectRemoteResources = function(player) {
    var remotes = [],
        anim = this;
    this.visitElems(function(elm) {
        if (elm._hasRemoteResources(anim, player)) {
           remotes = remotes.concat(elm._collectRemoteResources(anim, player)/* || []*/);
        }
    });
    if(this.fonts && this.fonts.length) {
        remotes = remotes.concat(this.fonts.map(function(f){return f.url;}));
    }
    return remotes;
}
Animation.prototype._loadRemoteResources = function(player) {
    var anim = this;
    this.visitElems(function(elm) {
        if (elm._hasRemoteResources(anim, player)) {
           elm._loadRemoteResources(anim, player);
        }
    });
    anim.loadFonts(player);
}
Animation.prototype.__ensureHasMaskCanvas = function(lvl) {
    if (this.__maskCvs && this.__backCvs &&
        this.__maskCvs[lvl] && this.__backCvs[lvl]) return;
    if (!this.__maskCvs) { this.__maskCvs = []; this.__maskCtx = []; }
    if (!this.__backCvs) { this.__backCvs = []; this.__backCtx = []; }
    this.__maskCvs[lvl] = engine.createCanvas(1, 1);
    this.__maskCtx[lvl] = engine.getContext(this.__maskCvs[lvl], '2d');
    this.__backCvs[lvl] = engine.createCanvas(1, 1);
    this.__backCtx[lvl] = engine.getContext(this.__backCvs[lvl], '2d');
    //document.body.appendChild(this.__maskCvs[lvl]);
    //document.body.appendChild(this.__backCvs[lvl]);
}
Animation.prototype.__removeMaskCanvases = function() {
    if (!this.__maskCvs && !this.__backCvs) return;
    if (this.__maskCvs) {
        for (var i = 0, il = this.__maskCvs.length; i < il; i++) {
            if (this.__maskCvs[i]) { // use `continue`?
                engine.disposeElement(this.__maskCvs[i]);
                this.__maskCvs[i] = null; // is it required?
                this.__maskCtx[i] = null; // is it required?
            }
        }
        this.__maskCvs = null;
        this.__maskCtx = null;
    }
    if (this.__backCvs) {
        for (var i = 0, il = this.__backCvs.length; i < il; i++) {
            if (this.__backCvs[i]) { // use `continue`?
                engine.disposeElement(this.__backCvs[i]);
                this.__backCvs[i] = null; // is it required?
                this.__backCtx[i] = null; // is it required?
            }
        }
        this.__maskCvs = null;
        this.__backCtx = null;
    }
}
Animation.prototype.findById = function(id) {
    return this.hash[id];
}
Animation.prototype.findByName = function(name, where) {
    var where = where || this;
    var found = [];
    if (where.name == name) found.push(name);
    where.travelChildren(function(elm)  {
        if (elm.name == name) found.push(elm);
    });
    return found;
}
Animation.prototype.invokeAllLaters = function() {
    for (var i = 0; i < this._laters.length; i++) {
        this._laters[i].call(this);
    };
}
Animation.prototype.clearAllLaters = function() {
    this._laters = [];
}
// > Animation.invokeLater % (f: Function())
Animation.prototype.invokeLater = function(f) {
    this._laters.push(f);
}
Animation.prototype.loadFonts = function(player) {
    if (!this.fonts || !this.fonts.length) {
        return;
    }

    var fonts = this.fonts,
        style = document.createElement('style'),
        css = '',
        fontsToLoad = [],
        detector = new FontDetector();
    style.type = 'text/css';

    for (var i = 0; i < fonts.length; i++) {
        var font = fonts[i];
        if (!font.url || !font.face || detector.detect(font.face)) {
            //no font name or url || font already available
            continue;
        }
        fontsToLoad.push(font);
        css += '@font-face {' +
            'font-family: "' + font.face + '"; ' +
            'src: url(' + font.url + '); ' +
            (font.style ? 'style: ' + font.style +'; ' : '') +
            (font.weight ? 'weight: ' + font.weight + '; ' : '') +
            '}\n';
    }

    if (fontsToLoad.length == 0) {
        return;
    };

    style.innerHTML = css;
    document.head.appendChild(style);

    for (var i = 0; i < fontsToLoad.length; i++) {
        ResMan.loadOrGet(player.id, fontsToLoad[i].url, function(success) {
            var face = fontsToLoad[i].face,
                interval = 100,
                intervalId,
                checkLoaded = function() {
                    var loaded = detector.detect(face);
                    if (loaded) {
                        clearInterval(intervalId);
                        success();
                    }
                };
            intervalId = setInterval(checkLoaded, interval)
        });
    }

};

module.exports = Animation;
