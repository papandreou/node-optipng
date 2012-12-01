var childProcess = require('child_process'),
    Stream = require('stream').Stream,
    util = require('util'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath');

function OptiPng(optiPngArgs) {
    Stream.call(this);

    this.optiPngArgs = optiPngArgs || [];

    this.writable = this.readable = true;
    this.incomingChunks = [];
}

util.inherits(OptiPng, Stream);

OptiPng.prototype.write = function (chunk) {
    this.incomingChunks.push(chunk);
};

OptiPng.prototype.end = function (chunk) {
    if (chunk) {
        this.write(chunk);
    }
    this.writable = false;
    var optiPngInputFilePath = getTemporaryFilePath({suffix: '.png'});
    fs.writeFile(optiPngInputFilePath, Buffer.concat(this.incomingChunks), function (err) {
        if (err) {
            this.emit(err);
        } else {
            var optiPngProcess = childProcess.spawn('optipng', this.optiPngArgs.concat(optiPngInputFilePath));
            optiPngProcess.on('exit', function (exitCode) {
                if (exitCode > 0) {
                    return this.emit('error', new Error('The optipng process exited with a non-zero exit code: ' + exitCode));
                }
                this.readStream = fs.createReadStream(optiPngInputFilePath);
                if (this.isPaused) {
                    this.readStream.pause();
                }
                this.readStream.on('data', function (chunk) {
                    this.emit('data', chunk);
                }.bind(this));
                this.readStream.on('end', function () {
                    fs.unlink(optiPngInputFilePath, function (err) {
                        if (err) {
                            console.error(err.stack);
                        }
                    });
                    this.emit('end');
                }.bind(this));
            }.bind(this));
        }
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
