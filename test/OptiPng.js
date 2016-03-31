/* global describe, it*/
var expect = require('unexpected').clone()
    .use(require('unexpected-stream'))
    .use(require('unexpected-sinon'));
var sinon = require('sinon');
var OptiPng = require('../lib/OptiPng');
var Path = require('path');
var fs = require('fs');

describe('OptiPng', function () {
    it('should produce a smaller file when run with -o7 on a suboptimal PNG', function () {
        return expect(
            fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')),
            'when piped through',
            new OptiPng(['-o7']),
            'to yield output satisfying',
            function (resultPngBuffer) {
                expect(resultPngBuffer.length, 'to be within', 0, 152);
            }
        );
    });

    it('should not emit data events while paused', function (done) {
        var optiPng = new OptiPng(['-o7']);

        function fail() {
            done(new Error('OptiPng emitted data while it was paused!'));
        }
        optiPng.pause();
        optiPng.on('data', fail).on('error', done);

        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(optiPng);

        setTimeout(function () {
            optiPng.removeListener('data', fail);
            var chunks = [];

            optiPng
                .on('data', function (chunk) {
                    chunks.push(chunk);
                })
                .on('end', function () {
                    var resultPngBuffer = Buffer.concat(chunks);
                    expect(resultPngBuffer.length, 'to be within', 0, 152);
                    done();
                });

            optiPng.resume();
        }, 1000);
    });

    it('should emit an error if an invalid image is processed', function (done) {
        var optiPng = new OptiPng();

        optiPng.on('error', function (err) {
            done();
        }).on('data', function (chunk) {
            if(chunk !== null)
            done(new Error('OptiPng emitted data when an error was expected'));
        });

        optiPng.end(new Buffer('qwvopeqwovkqvwiejvq', 'utf-8'));
    });

    it('should emit a single error if an invalid command line is specified', function (done) {
        var optiPng = new OptiPng(['-vqve']),
            seenError = false;

        optiPng.on('error', function (err) {
            expect(optiPng.commandLine, 'to match', /optipng(\.exe)? -vqve .*?\.png$/);
            if (seenError) {
                done(new Error('More than one error event was emitted'));
            } else {
                seenError = true;
                setTimeout(done, 100);
            }
        }).on('data', function (chunk) {
            if (chunk !== null)
            done(new Error('OptiPng emitted data when an error was expected'));
        });

        optiPng.end(new Buffer('qwvopeqwovkqvwiejvq', 'utf-8'));
    });

    describe('#destroy', function () {
        describe('when called before the fs.WriteStream is created', function () {
            it('should', function () {
                var optiPng = new OptiPng(['-o7']);
                fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(optiPng);
                optiPng.destroy();
                return expect.promise(function (run) {
                    setTimeout(run(function () {
                        expect(optiPng, 'to satisfy', {
                            writeStream: expect.it('to be falsy'),
                            optiPngProcess: expect.it('to be falsy')
                        });
                    }), 10);
                });
            });

        });
        describe('when called while the fs.WriteStream is active', function () {
            it('should abort the fs.WriteStream and remove the temporary file', function () {
                var optiPng = new OptiPng(['-o7']);
                fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(optiPng);

                optiPng.write('PNG');

                return expect.promise(function (run) {
                    setTimeout(run(function waitForWriteStream() {
                        var writeStream = optiPng.writeStream;
                        if (optiPng.writeStream) {
                            optiPng.destroy();
                            expect(optiPng.writeStream, 'to be falsy');
                            sinon.spy(writeStream, 'end');
                            sinon.spy(writeStream, 'write');
                            setTimeout(run(function () {
                                expect([writeStream.end, writeStream.write], 'to have calls satisfying', []);
                            }), 10);
                        } else {
                            setTimeout(run(waitForWriteStream), 0);
                        }
                    }), 0);
                });
            });
        });

        describe('when called while the optipng process is running', function () {
            it('should kill the optipng process and remove the temporary file', function () {
                var optiPng = new OptiPng(['-o7']);
                fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(optiPng);

                sinon.spy(fs, 'unlink');
                return expect.promise(function (run) {
                    setTimeout(run(function waitForOptiPngProcess() {
                        var optiPngProcess = optiPng.optiPngProcess;
                        if (optiPng.optiPngProcess) {
                            sinon.spy(optiPngProcess, 'kill');
                            var tempFileName = optiPng.tempFile;
                            expect(tempFileName, 'to be a string');
                            optiPng.destroy();
                            expect([optiPngProcess.kill, fs.unlink], 'to have calls satisfying', function () {
                                optiPngProcess.kill();
                                fs.unlink(tempFileName, expect.it('to be a function'));
                            });
                            expect(optiPng.optiPngProcess, 'to be falsy');
                        } else {
                            setTimeout(run(waitForOptiPngProcess), 0);
                        }
                    }), 0);
                }).finally(function () {
                    fs.unlink.restore();
                });
            });
        });

        describe('when called while streaming from the temporary output file', function () {
            it('should kill the optipng process and remove the temporary output file', function () {
                var optiPng = new OptiPng(['-o7']);
                fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(optiPng);

                sinon.spy(fs, 'unlink');
                return expect.promise(function (run) {
                    setTimeout(run(function waitForReadStream() {
                        var readStream = optiPng.readStream;
                        if (readStream) {
                            sinon.spy(readStream, 'destroy');
                            expect(optiPng.optiPngProcess, 'to be falsy');
                            var tempFileName = optiPng.tempFile;
                            expect(tempFileName, 'to be a string');
                            optiPng.destroy();
                            expect(fs.unlink, 'to have calls satisfying', function () {
                                fs.unlink(tempFileName, expect.it('to be a function'));
                            });
                        } else {
                            setTimeout(run(waitForReadStream), 0);
                        }
                    }), 0);
                }).finally(function () {
                    fs.unlink.restore();
                });
            });
        });
    });
});
