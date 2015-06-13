/*global Buffer, console*/  //this line for jshint
/*jshint asi:false*/
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

OptiPng.getBinPath = memoizeAsync(function getBinPathAsync(cb) {
    which('optipng', function onWhichDone(err, binary) {
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

OptiPng.prototype._read = function _read (n){
  // pause/unpause the filestream w/ 1 cycle delay
  if(this.isPaused() && this.rs && !this.rs.isPaused()) {
        this.rs.pause();
  }else if (this.rs && this.rs.isPaused()) {
    this.rs.resume();
  }
};

OptiPng.prototype._write = function _write (chunk, enc, done){
    if (!this.ws) {
        this.tempFile = getTempFilePath({suffix: '.png'});
        this.ws = fs.createWriteStream(this.tempFile);
        // can pass error as 1st arg to done callbak, so this works
        this.ws.on('error', function onWsErr(err){
            this._error(err);
        }.bind(this));
    }
    this.ws.write(chunk, enc);
    done();
};

OptiPng.prototype.end = function end(chunk) {
    if (chunk) {
        this.write(chunk);
    }
    this.ws.end();
    this.ws.on('close', function onWsClose() {
        OptiPng.getBinPath(runBinary);
    });

    var bailOut = this._error.bind(this);

    var runBinary = function runBinary (err, binary){
        if (err) { bailOut(err); }

        this.binArgs.push(this.tempFile);
        var binProcess = childProcess.spawn(binary, this.binArgs);
        
        // used by test suite
        this.commandLine = binary +  (this.binArgs ? ' ' + this.binArgs.join(' ') : '');

        binProcess.on('error', bailOut);
        binProcess.on('exit', onBinComplete);
    }.bind(this);

    var onBinComplete = function onBinComplete (exitCode){
      if (exitCode > 0) {
            return bailOut('error',new Error('The optipng process exited with a non-zero exit code: ' + exitCode));
        }
        this.rs = fs.createReadStream(this.tempFile);
        this.rs.on('error', bailOut);
        this.rs.on('data', function onRsData(chunk) { 
          this.push(chunk); 
        }.bind(this));
        if (this.isPaused()) {this.rs.pause(); }
        this.rs.on('end', function onRsEnd() {
            this.push(null);
            fs.unlink(this.tempFile, function onUnlink(err){
                if(err) console.error(err.stack);
             });
        }.bind(this));
    }.bind(this);
};

OptiPng.prototype._error = function _error(err){
    this.push(null);
    fs.unlink(this.tempFile, function onUnlink(err){
        if(err) console.error(err.stack);
    });
    this.emit('error', err);
};


module.exports = OptiPng;