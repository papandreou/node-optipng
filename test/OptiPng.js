var expect = require('unexpected'),
    OptiPng = require('../lib/OptiPng'),
    Path = require('path'),
    fs = require('fs');

describe('OptiPng', function () {
    it('should produce a smaller file when run with -o7 on a suboptimal PNG', function (done) {
        var optiPng = new OptiPng(['-o7']),
            chunks = [];
        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png'))
            .pipe(optiPng)
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', function () {
                var resultPngBuffer = Buffer.concat(chunks);
                expect(resultPngBuffer.length, 'to be greater than', 0);
                expect(resultPngBuffer.length, 'to be less than', 152);
                done();
            })
            .on('error', function(err){
              done(new Error('Error event was emitted when smaller file was expected.'));
            });
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
                    expect(resultPngBuffer.length, 'to be greater than', 0);
                    expect(resultPngBuffer.length, 'to be less than', 152);
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
            expect(optiPng.commandLine, 'to match', /optipng[\.exe]+ -vqve .*?\.png$/);
            if (seenError) {
                done(new Error('More than one error event was emitted'));
            } else {
                seenError = true;
                setTimeout(done, 100);
            }
        }).on('data', function (chunk) {
            if (chunk !== null)
            done(new Error('OptiPng emitted data when an error was expected'));
        })
        
        optiPng.end(new Buffer('qwvopeqwovkqvwiejvq', 'utf-8'));
    });
});
