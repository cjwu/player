var Timeline = require('./timeline.js');

var utils = require('../utils.js'),
    iter = utils.iter;

function Scene(anim, name, duration) {
    this.anim = anim;
    this.name = name;
    this.time = new Timeline();
    this.time.setDuration(is.num(duration) ? duration : Infinity);
    this.next = null;

    this.tree = [];
    this.hash = {};
}

Scene.prototype.setDuration = function(duration) {
    this.time.setDuration(duration);
}

Scene.prototype.getDuration = function() {
    return this.time.getDuration();
}

Scene.prototype.setNext = function(scene) {
    this.next = scene;
}

Scene.prototype.getNext = function(scene) {
    return this.next;
}

Scene.prototype.traverse = function(visitor, data) {
    utils.keys(this.hash, function(key, elm) { return visitor(elm, data); });
};

Scene.prototype.each = function(visitor, data) {
    for (var i = 0, tlen = this.tree.length; i < tlen; i++) {
        if (visitor(this.tree[i], data) === false) break;
    }
};

Scene.prototype.reverseEach = function(visitor, data) {
    var i = this.tree.length;
    while (i--) {
        if (visitor(this.tree[i], data) === false) break;
    }
};

Scene.prototype.iter = function(func, rfunc) {
    iter(this.tree).each(func, rfunc);
};

Scene.prototype.add = function(arg1, arg2, arg3) {
    var element = Element._fromArguments(arg1, arg2, arg3);
    if (!elm.children) throw errors.animation(ErrLoc.A.OBJECT_IS_NOT_ELEMENT, this);
    this._register(elm);
    /*if (elm.children) this._addElems(elm.children);*/
    this.tree.push(elm);
};

Scene.prototype.remove = function(elm) {
    // error will be thrown in _unregister method if element is not registered
    if (elm.parent) {
        // it will unregister element inside
        elm.parent.remove(elm);
    } else {
        this._unregister(elm);
    }
}

Scene.prototype.isEmpty = function() {
    return this.tree.length === 0;
};

Scene.prototype._register = function(elm) {
    if (this.hash[elm.id]) throw errors.animation(ErrLoc.A.ELEMENT_IS_REGISTERED, this);
    elm.registered = true;
    elm.anim = this.anim; elm.scene = this;
    this.hash[elm.id] = elm;

    var me = this;

    elm.each(function(child) {
        me._register(child);
    });
};

Scene.prototype._unregister_no_rm = function(elm) {
    this._unregister(elm, true);
};

Scene.prototype._unregister = function(elm, save_in_tree) { // save_in_tree is optional and false by default
    if (!elm.registered) throw errors.animation(ErrLoc.A.ELEMENT_IS_NOT_REGISTERED, this);
    var me = this;
    elm.each(function(child) {
        me._unregister(child);
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
    elm.scene = null;
    //elm.parent = null;
};

module.exports = Scene;
