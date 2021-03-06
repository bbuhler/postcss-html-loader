var path = require('path');

var blue = require('./plugins/blue');
var red = require('./plugins/red');
var RewritePlugin = require('./webpack-plugins/rewrite.js');

module.exports = {
    target:  'node',
    context: __dirname,
    entry:   './test-explicit-plugins.js',
    output: {
        filename: 'test-explicit-plugins.test.js',
        path: path.join(__dirname, '..', 'build')
    },
    postcss: function () {
        return [blue, red({ alpha: 0.1 })];
    },
    plugins: [
        new RewritePlugin()
    ]
};
