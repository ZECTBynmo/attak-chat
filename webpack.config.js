var path = require('path');
module.exports = {
    entry: './public/main.js',
    devtool: '#eval-cheap-module-source-map',
    output: {
        path: __dirname + '/build',
        sourceMapFilename: "maps.map",
        filename: 'bundle.js'
    },
    resolve: {
        extensions: [".js"],

        // Directory names to be searched for modules
        modules: ['public/js', 'node_modules'],

        // Replace modules with other modules or paths for compatibility or convenience
        alias: {
          'underscore': 'lodash'
        }
    },
    module: {
        loaders: [
            { test: /\.pug$/,   loader: "pug-loader?self" },
            { test: /\.css$/,    loader: "style-loader!css-loader" },
        ]
    }
};