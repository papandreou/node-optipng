node-optipng
=============

The optipng command line utility as a readable/writable stream. This
is handy for situations where you don't want to worry about writing
the input to disc and reading the output afterwards.

The constructor optionally takes an array of command line options for
the `optipng` binary:

```javascript
var OptiPng = require('optipng'),
    myCrusher = new OptiPng(['-o7']);

sourceStream.pipe(myCrusher).pipe(destinationStream);
```

OptiPng as a web service:

```javascript
var OptiPng = require('optipng'),
    http = require('http');

http.createServer(function (req, res) {
    if (req.headers['content-type'] === 'image/png') {
        res.writeHead(200, {'Content-Type': 'image/png'});
        req.pipe(new OptiPng(['-o7'])).pipe(res);
    } else {
        res.writeHead(400);
        res.end('Feed me a PNG!');
    }
}).listen(1337);
```

Installation
------------

Make sure you have node.js and npm installed, then run:

    npm install optipng

License
-------

3-clause BSD license -- see the `LICENSE` file for details.
