var childProcess = require('child_process'),
    Stream = require('stream').Stream,
    util = require('util'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath'),
    which = require('which'),
    memoizeAsync = require('memoizeasync');

function OptiPng(optiPngArgs) {
    Stream.call(this);

    this.optiPngArgs = optiPngArgs || [];

    this.writable = this.readable = true;

    this.optiPngInputFilePath = getTemporaryFilePath({suffix: '.png'});
    this.writeStream = fs.createWriteStream(this.optiPngInputFilePath);
    this.writeStream.on('error', function (err) {
        this.emit('error', err);
    }.bind(this));
}

util.inherits(OptiPng, Stream);

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

OptiPng.prototype.write = function (chunk) {
    this.writeStream.write(chunk);
};

OptiPng.prototype.end = function (chunk) {
    if (chunk) {
        this.write(chunk);
    }
    this.writeStream.end();
    this.writable = false;
    this.writeStream.on('close', function () {
        OptiPng.getBinaryPath(function (err, optiPngBinaryPath) {
            if (err) {
                return this.emit('error', err);
            }
            var optiPngProcess = childProcess.spawn(optiPngBinaryPath, this.optiPngArgs.concat(this.optiPngInputFilePath));
            optiPngProcess.on('exit', function (exitCode) {
                if (exitCode > 0) {
                    return this.emit('error', new Error('The optipng process exited with a non-zero exit code: ' + exitCode));
                }
                this.readStream = fs.createReadStream(this.optiPngInputFilePath);
                if (this.isPaused) {
                    this.readStream.pause();
                }
                this.readStream.on('data', function (chunk) {
                    this.emit('data', chunk);
                }.bind(this));
                this.readStream.on('end', function () {
                    fs.unlink(this.optiPngInputFilePath, function (err) {
                        if (err) {
                            console.error(err.stack);
                        }
                    });
                    this.emit('end');
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }.bind(this));
};

// Proxy pause and resume to the underlying readStream if it has been
// created, otherwise just keep track of the paused state:
OptiPng.prototype.pause = function () {
    this.isPaused = true;
    if (this.readStream) {
        this.readStream.pause();
    }
};

OptiPng.prototype.resume = function () {
    this.isPaused = false;
    if (this.readStream) {
        this.readStream.resume();
    }
};

module.exports = OptiPng;
