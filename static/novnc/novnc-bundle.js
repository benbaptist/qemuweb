// noVNC Bundle
(function(window) {
    "use strict";

    // Create exports object
    const exports = {};
    window.exports = exports;
    window.module = { exports: exports };

    // Load core files in the correct order
    {% include 'browser.js' %}
    {% include 'logging.js' %}
    {% include 'events.js' %}
    {% include 'base64.js' %}
    {% include 'websock.js' %}
    {% include 'rfb.js' %}

    // Expose RFB to the window object
    window.RFB = exports.default || exports.RFB;
    
    // Cleanup
    delete window.exports;
    delete window.module;
})(window); 