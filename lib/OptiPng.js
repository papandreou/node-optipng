/*global Buffer, console*/  //this line for jshint
'use strict';

var childProcess = require('child_process'),
    Duplex = require('stream').Duplex,
    util = require('util'),
    fs = require('fs'),
    getTempFilePath = require('gettemporaryfilepath'),
    which = require('which'),
    memoizeAsync = require('memoizeasync');

function OptiPng(binArgs) {
    if (!(this instanceof OptiPng))
        return new OptiPng(binArgs);
    Duplex.call(this);
    this.binArgs = binArgs || [];
}
util.inherits(OptiPng, Duplex);

OptiPng.getBinPath = memoizeAsync(function (cb) {
    which('optipng', function (err, binary) {
        if (err) {
            binary = require('optipng-bin').path;
        }
        if (binary) {
            cb(null, binary);
        } else {
            cb(new Error('No optipng binary in PATH and optipng-bin does not provide a pre-built binary for your architecture'));
        }
    });
});

OptiPng.prototype._read = function (n){/*no-op*/};

OptiPng.prototype._write = function (chunk, enc, done) {
    if (!this.ws) {
        this.tempFile = getTempFilePath({suffix: '.png'});
        this.ws = fs.createWriteStream(this.tempFile);
        // can pass error as 1st arg to done callbak, so this works
        this.ws.on('error', done);
    }
    this.ws.write(chunk, enc);
    done();
};

OptiPng.prototype.end = function (chunk) {
    var th = this
    if (chunk) {
        th.write(chunk);
    }
    th.ws.end();
    th.ws.on('close', function () {
        OptiPng.getBinPath(runBinary);
    });

    function emitErr(err){th.emit(err)}

    function runBinary (err, binary) {
        if (err) {
            return th.emit(err)
        }

        th.binArgs.push(th.tempFile);
        var binProcess = childProcess.spawn(binary, th.binArgs);
        th.commandLine = binary +  (th.binArgs ? ' ' + th.binArgs.join(' ') : ''); // For debugging

        binProcess.on('error', emitErr);

        binProcess.on('exit', onBinExit);
    }

    function onBinExit (exitCode){
      if (exitCode > 0) {
            return th.emit('error',new Error('The optipng process exited with a non-zero exit code: ' + exitCode));
        }
        var rs = fs.createReadStream(th.tempFile);
        rs.on('error', emitErr)
        // for some reason it chokes w/o the anonymous func 
        // around this push
        rs.on('data', function (chunk) { th.push(chunk); });
        rs.on('end', function () {
            th.push(null);
            fs.unlink(th.tempFile, function (err) {
                if (err) {
                    console.error(err.stack);
                }
            });
        });
    }
};


module.exports = OptiPng;

// the rest is no longer need
