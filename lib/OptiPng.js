/*global Buffer, console*/  //this line for jshint
'use strict';

var childProcess = require('child_process'),
    Duplex = require('stream').Duplex,
    util = require('util'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath'),
    which = require('which'),
    memoizeAsync = require('memoizeasync');

function OptiPng(optiPngArgs) {
    // safety: works right without 'new' keyword
    if (!(this instanceof OptiPng))
        return new OptiPng(optiPngArgs);
    Duplex.call(this);
    this.optiPngArgs = optiPngArgs || [];
    // don't need the other values w/ new streams
}
util.inherits(OptiPng, Duplex);

OptiPng.getBinaryPath = memoizeAsync(function (cb) {
    which('optipng', function (err, optiPngBinaryPath) {
        if (err) {
            optiPngBinaryPath = require('optipng-bin').path;
        }
        if (optiPngBinaryPath) {
            cb(null, optiPngBinaryPath);
        } else {
            cb(new Error('No optipng binary in PATH and optipng-bin does not provide a pre-built binary for your architecture'));
        }
    });
});

// _read must be implemented for duplex, but data not pushed yet
OptiPng.prototype._read = function (n){/*no-op*/};

OptiPng.prototype._write = function (chunk, enc, done) {
    if (!this.writeStream) {
        this.optiPngInputFilePath = getTemporaryFilePath({suffix: '.png'});
        this.writeStream = fs.createWriteStream(this.optiPngInputFilePath);
        this.writeStream.on('error', this._reportError.bind(this));
    }
    this.writeStream.write(chunk, enc);
    done(); // callback tells incoming stream we're ready for more
};

OptiPng.prototype.end = function (chunk) {
    if (chunk) {
        this.write(chunk);
    }
    this.writeStream.end();
    this.writeStream.on('close', function () {
        OptiPng.getBinaryPath(function (err, optiPngBinaryPath) {
            if (err) {
                return this.emit('error',err);
            }

            this.optiPngArgs.push(this.optiPngInputFilePath);
            var optiPngProcess = childProcess.spawn(optiPngBinaryPath, this.optiPngArgs);
            this.commandLine = optiPngBinaryPath +  (this.optiPngArgs ? ' ' + this.optiPngArgs.join(' ') : ''); // For debugging

            optiPngProcess.on('error', this._reportError.bind(this));

            optiPngProcess.on('exit', function (exitCode) {
                if (exitCode > 0) {
                    // just emit errors we don't need
                    // to track hasEnded
                    return this.emit('error',new Error('The optipng process exited with a non-zero exit code: ' + exitCode));
                }
                this.readStream = fs.createReadStream(this.optiPngInputFilePath);
                // pausing is automatic now
                this.readStream.on('data', function (chunk) {
                    // queues the data and begins to magically 
                    // emit buffers at whatever speed they can
                    // be consumed
                    this.push(chunk);
                }.bind(this));
                this.readStream.on('end', function () {
                    // put null object at end of queue. when 
                    // null is consumed it magically ends stream
                    this.push(null);
                    fs.unlink(this.optiPngInputFilePath, function (err) {
                        if (err) {
                            console.error(err.stack);
                        }
                    });
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }.bind(this));
};

// put this back in to avoid refactoring some error calls
OptiPng.prototype._reportError = function (err){
  this.emit('error',err)
}

module.exports = OptiPng;

// the rest is no longer need
