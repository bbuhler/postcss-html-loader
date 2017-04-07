var loaderUtils = require('loader-utils');
var loadConfig  = require('postcss-load-config');
var postcss     = require('postcss');
var assign      = require('object-assign');
var path        = require('path');
var cheerio     = require('cheerio');

var PostCSSLoaderError = require('./error');

function parseOptions(options, pack) {
    if ( typeof options === 'function' ) {
        options = options.call(this, this);
    }

    var plugins;
    if ( typeof options === 'undefined') {
        plugins = [];
    } else if ( Array.isArray(options) ) {
        plugins = options;
    } else {
        plugins = options.plugins || options.defaults;
    }

    if ( pack ) {
        plugins = options[pack];
        if ( !plugins ) {
            throw new Error('PostCSS plugin pack is not defined in options');
        }
    }

    var opts = { };
    if ( typeof options !== 'undefined' ) {
        opts.stringifier = options.stringifier;
        opts.parser      = options.parser;
        opts.syntax      = options.syntax;
    }

    var exec = options && options.exec;
    return Promise.resolve({ options: opts, plugins: plugins, exec: exec });
}

module.exports = function (source, map) {
    if ( this.cacheable ) this.cacheable();

    var loader = this;
    var file   = loader.resourcePath;
    var params = loaderUtils.getOptions(loader) || {};

    var options  = params.plugins || loader.options.postcss;
    var pack     = params.pack;
    var callback = loader.async();

    var configPath;

    if (params.config) {
        if (path.isAbsolute(params.config)) {
            configPath = params.config;
        } else {
            configPath = path.join(process.cwd(), params.config);
        }
    } else {
        configPath = path.dirname(file);
    }

    Promise.resolve().then(function () {
        if ( typeof options !== 'undefined' ) {
            return parseOptions.call(loader, options, pack);
        } else {
            if ( pack ) {
                throw new Error('PostCSS plugin pack is supported ' +
                                'only when use plugins in webpack config');
            }
            return loadConfig({ webpack: loader }, configPath, { argv: false });
        }
    }).then(function (config) {
        if ( !config ) config = { };

        if ( config.file ) loader.addDependency(config.file);

        var plugins = config.plugins || [];

        var opts  = assign({}, config.options, {
            from: file,
            to:   file,
            map:  {
                inline:     params.sourceMap === 'inline',
                annotation: false
            }
        });

        if ( typeof map === 'string' ) map = JSON.parse(map);
        if ( map && map.mappings ) opts.map.prev = map;

        if ( params.syntax ) {
            if ( typeof params.syntax === 'string' ) {
                opts.syntax = require(params.syntax);
            } else {
                opts.syntax = params.syntax;
            }
        }
        if ( params.parser ) {
            if ( typeof params.parser === 'string' ) {
                opts.parser = require(params.parser);
            } else {
                opts.parser = params.parser;
            }
        }
        if ( params.stringifier ) {
            if ( typeof params.stringifier === 'string' ) {
                opts.stringifier = require(params.stringifier);
            } else {
                opts.stringifier = params.stringifier;
            }
        }

        var exec = params.exec || config.exec;
        if ( params.parser === 'postcss-js' || exec ) {
            source = loader.exec(source, loader.resource);
        }

        // Allow plugins to add or remove postcss plugins
        if ( loader._compilation ) {
            plugins = loader._compilation.applyPluginsWaterfall(
              'postcss-loader-before-processing',
              [].concat(plugins),
              params
            );
        }

        var $ = cheerio.load(source, { decodeEntities: false });
        var processor = postcss(plugins);
        var promises = [];

        $('style').contents().each(function (index, style) {
            promises.push(processor.process(style.data, opts)
                .then(function (result) {
                    style.data = result.css;
                    return result;
                })
            );
        });

        $('[style]').each(function (index, element) {
            promises.push(processor.process(element.attribs.style, opts)
                .then(function (result) {
                    element.attribs.style = result.css;
                    return result;
                })
            );
        });

        return Promise.all(promises).then(function (results) {
            results.forEach(function (result) {
                result.warnings().forEach(function (msg) {
                    loader.emitWarning(msg.toString());
                });

                result.messages.forEach(function (msg) {
                    if ( msg.type === 'dependency' ) {
                        loader.addDependency(msg.file);
                    }
                });
            });

            callback(null, $.html());
            return null;
        });
    }).catch(function (error) {
        if ( error.name === 'CssSyntaxError' ) {
            callback(new PostCSSLoaderError(error));
        } else {
            callback(error);
        }
    });
};
