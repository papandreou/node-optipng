var childProcess = require('child_process'),
    Duplex = require('stream').Duplex,
    util = require('util'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath'),
    which = require('which'),
    memoizeAsync = require('memoizeasync');

// a bit of boilerplate to set up our stream class
function OptiPng(binArgs) {
    if (!(this instanceof OptiPng)) {
        return new OptiPng(binArgs);
    }
    Duplex.call(this);
    this.binArgs = binArgs || []; // args to pass to cli command
}
util.inherits(OptiPng, Duplex);

OptiPng.getBinaryPath = memoizeAsync(function (cb) {
    // trying environment path first
    which('optipng', function onWhichDone(err, binary) {
        if (err) { // not in environment path, try in node_modules
            binary = require('optipng-bin');
        }
        if (binary) { // found somewhere
            cb(null, binary);
        } else {
            cb(new Error('No optipng binary in PATH and optipng-bin does not provide a pre-built binary for your architecture'));
        }
    });
});

OptiPng.prototype._read = function _read (n){
    // don't push anything here, this is no-op unless we need to resume
    // underlying read. We'll push into queue later.
    if (this.readStream) {
        this.readStream.resume();
    }
};

OptiPng.prototype._write = function _write (chunk, enc, done){
    if (this.hasEnded) {
        return;
    }
    if (!this.writeStream) { // write a tempfile to give to binary
        this.tempFile = getTemporaryFilePath({suffix: '.png'});
        this.writeStream = fs.createWriteStream(this.tempFile);
        this.writeStream.on('error', function onWsErr(err){
            this._error(err);
        }.bind(this));
    }
    this.writeStream.write(chunk, enc);
    done();
};

OptiPng.prototype.end = function end(chunk) {
    if (this.hasEnded) {
        return;
    }
    if (chunk) {
        this.write(chunk); // any final bits
    }
    this.writeStream.end();
    this.writeStream.once('close', function onWsClose() {
        // runBinary is a callback
        OptiPng.getBinaryPath( runBinary );
    });

    // prebind for easy drop-in
    var bailOut = this._error.bind(this);

    var runBinary = function runBinary (err, binary){
        if (err) {
            bailOut(err);
        }

        this.binArgs.push(this.tempFile); // final arg is  the file
        this.optiPngProcess = childProcess.spawn(binary, this.binArgs);

        // format a copy of the cli string for test suite
        this.commandLine = binary + (this.binArgs ? ' ' + this.binArgs.join(' ') : '');

        this.optiPngProcess.once('error', bailOut);
        this.optiPngProcess.once('exit', onBinComplete);
    }.bind(this);

    var onBinComplete = function onBinComplete (exitCode){
        this.optiPngProcess = null;
        if (this.hasEnded) {
            return;
        }
        if (exitCode > 0) {
            return bailOut(new Error('The optipng process exited with a non-zero exit code: ' + exitCode));
        }
        // read back out the new file
        this.readStream = fs.createReadStream(this.tempFile);
        this.readStream.once('error', bailOut);
        this.readStream.on('data', function onReadStreamData(chunk) {
            // pipe it into the outgoing queue
            var flowing = this.push(chunk);
            // false here means output not being read, pause and wait
            if (flowing === false) {
                this.readStream.pause();
            }
        }.bind(this));
        this.readStream.once('end', function onReadStreamEnd() {
            this.push(null); // null closes the stream
            fs.unlink(this.tempFile, function onUnlink(err){
                // not emitting this error since stream is done
                if (err) {
                    console.error(err.stack);
                }
            });
        }.bind(this));
    }.bind(this);
};

OptiPng.prototype.destroy = function () {
    this.hasEnded = true;
    if (this.readStream) {
        this.readStream.destroy();
        this.readStream = null;
    }
    if (this.writeStream) {
        this.writeStream.destroy();
        this.writeStream = null;
    }
    if (this.optiPngProcess) {
        this.optiPngProcess.kill();
        this.optiPngProcess = null;
    }
    if (this.tempFile) {
        fs.unlink(this.tempFile, function onUnlink(err){
            // not emitting this error since stream is done
            if (err) {
                console.error(err.stack);
            }
        });
        this.tempFile = null;
    }
};

OptiPng.prototype._error = function _error(err){
    if (!this.hasEnded) {
        this.destroy();
        this.emit('error', err);
    }
};

module.exports = OptiPng;
