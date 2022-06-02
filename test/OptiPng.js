const expect = require('unexpected')
  .clone()
  .use(require('unexpected-stream'))
  .use(require('unexpected-sinon'));
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const OptiPng = require('../lib/OptiPng');
const Path = require('path');
const fs = require('fs');

describe('OptiPng', () => {
  it('should produce a smaller file when run with -o7 on a suboptimal PNG', () =>
    expect(
      fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')),
      'when piped through',
      new OptiPng(['-o7']),
      'to yield output satisfying',
      expect.it((resultPngBuffer) => {
        expect(resultPngBuffer.length, 'to be within', 0, 152);
      })
    ));

  it('should not emit data events while paused', (done) => {
    const optiPng = new OptiPng(['-o7']);

    function fail() {
      done(new Error('OptiPng emitted data while it was paused!'));
    }
    optiPng.pause();
    optiPng.on('data', fail).on('error', done);

    fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(
      optiPng
    );

    setTimeout(() => {
      optiPng.removeListener('data', fail);
      const chunks = [];

      optiPng
        .on('data', (chunk) => {
          chunks.push(chunk);
        })
        .on('end', () => {
          const resultPngBuffer = Buffer.concat(chunks);
          expect(resultPngBuffer.length, 'to be within', 0, 152);
          done();
        });

      optiPng.resume();
    }, 1000);
  });

  it('should emit an error if an invalid image is processed', (done) => {
    const optiPng = new OptiPng();

    optiPng
      .on('error', () => {
        done();
      })
      .on('data', (chunk) => {
        if (chunk !== null) {
          done(new Error('OptiPng emitted data when an error was expected'));
        }
      });

    optiPng.end(Buffer.from('qwvopeqwovkqvwiejvq', 'utf-8'));
  });

  it('should end the output stream properly even if no data has been piped in', (done) => {
    const optiPng = new OptiPng(['-o7']);

    optiPng.on('error', (e) => {
      expect(e.message, 'to be', 'Closing stream before writing data.');
      done();
    });

    optiPng.end();
  });

  it('should emit a single error if an invalid command line is specified', (done) => {
    const optiPng = new OptiPng(['-vqve']);

    let seenError = false;

    optiPng
      .on('error', () => {
        expect(
          optiPng.commandLine,
          'to match',
          /optipng(\.exe)? -vqve .*?\.png$/
        );
        if (seenError) {
          done(new Error('More than one error event was emitted'));
        } else {
          seenError = true;
          setTimeout(done, 100);
        }
      })
      .on('data', (chunk) => {
        if (chunk !== null) {
          done(new Error('OptiPng emitted data when an error was expected'));
        }
      });

    optiPng.end(Buffer.from('qwvopeqwovkqvwiejvq', 'utf-8'));
  });

  describe('#destroy', () => {
    describe('when called before the fs.WriteStream is created', () => {
      it('should not create the fs.WriteStream or launch the optipng process', () => {
        const optiPng = new OptiPng(['-o7']);
        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(
          optiPng
        );
        optiPng.destroy();
        return expect.promise((run) => {
          setTimeout(
            run(() => {
              expect(optiPng, 'to satisfy', {
                writeStream: expect.it('to be falsy'),
                optiPngProcess: expect.it('to be falsy'),
              });
            }),
            10
          );
        });
      });
    });
    describe('when called while the fs.WriteStream is active', () => {
      it('should abort the fs.WriteStream and remove the temporary file', () => {
        const optiPng = new OptiPng(['-o7']);
        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(
          optiPng
        );

        return expect.promise((run) => {
          setTimeout(
            run(function waitForWriteStream() {
              const writeStream = optiPng.writeStream;
              if (optiPng.writeStream) {
                optiPng.destroy();
                expect(optiPng.writeStream, 'to be falsy');
                sinon.spy(writeStream, 'end');
                sinon.spy(writeStream, 'write');
                setTimeout(
                  run(() => {
                    expect(
                      [writeStream.end, writeStream.write],
                      'to have calls satisfying',
                      []
                    );
                  }),
                  10
                );
              } else {
                setTimeout(run(waitForWriteStream), 0);
              }
            }),
            0
          );
        });
      });
    });

    describe('when called while the optipng process is running', () => {
      it('should kill the optipng process and remove the temporary file', () => {
        const optiPng = new OptiPng(['-o7']);
        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(
          optiPng
        );

        sinon.spy(fs, 'unlink');
        return expect
          .promise((run) => {
            setTimeout(
              run(function waitForOptiPngProcess() {
                const optiPngProcess = optiPng.optiPngProcess;
                if (optiPng.optiPngProcess) {
                  sinon.spy(optiPngProcess, 'kill');
                  const tempFileName = optiPng.tempFile;
                  expect(tempFileName, 'to be a string');
                  optiPng.destroy();
                  expect(
                    [optiPngProcess.kill, fs.unlink],
                    'to have calls satisfying',
                    () => {
                      optiPngProcess.kill();
                      fs.unlink(tempFileName, expect.it('to be a function'));
                    }
                  );
                  expect(optiPng.optiPngProcess, 'to be falsy');
                } else {
                  setTimeout(run(waitForOptiPngProcess), 0);
                }
              }),
              0
            );
          })
          .finally(() => {
            fs.unlink.restore();
          });
      });
    });

    describe('when called while streaming from the temporary output file', () => {
      it('should kill the optipng process and remove the temporary output file', () => {
        const optiPng = new OptiPng(['-o7']);
        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')).pipe(
          optiPng
        );

        sinon.spy(fs, 'unlink');
        return expect
          .promise((run) => {
            setTimeout(
              run(function waitForReadStream() {
                const readStream = optiPng.readStream;
                if (readStream) {
                  sinon.spy(readStream, 'destroy');
                  expect(optiPng.optiPngProcess, 'to be falsy');
                  optiPng.destroy();
                  expect(fs.unlink, 'to have calls satisfying', () => {
                    fs.unlink(
                      expect.it('to be a string'),
                      expect.it('to be a function')
                    );
                  });
                } else {
                  setTimeout(run(waitForReadStream), 0);
                }
              }),
              0
            );
          })
          .finally(() => {
            fs.unlink.restore();
          });
      });
    });
  });

  describe('without an optipng binary installed on the system', function () {
    const which = sinon
      .stub()
      .withArgs('optipng')
      .yields(new Error('not found: optipng'));

    const OptiPngWithoutBin = proxyquire('../lib/OptiPng', {
      which,
    });

    it('should produce a smaller file when run with -o7 on a suboptimal PNG', () =>
      expect(
        fs.createReadStream(Path.resolve(__dirname, 'suboptimal.png')),
        'when piped through',
        new OptiPngWithoutBin(['-o7']),
        'to yield output satisfying',
        expect.it((resultPngBuffer) => {
          expect(resultPngBuffer.length, 'to be within', 0, 152);
        })
      ));
  });
});
