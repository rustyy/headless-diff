const screenshot = require('headless-bulk-screenshot');
const resemble = require('node-resemble-js');
const flatten = require('./flatten');
const fs = require('fs');

module.exports = class Diff {
    constructor(tasks, options) {
        this.options = options;
        this.tasks = tasks;
        this.dir = options.dir;
        this.tolerance = options.tolerance || 0.01;
        this.failFileSuffix = options.failFileSuffix || '_fail';
        this.diffFileSuffix = options.diffFileSuffix || '_diff';
        this.fileType = 'png';
        this.screenshotOptions = this.getScreenshotOptions(options);
        this.errors = [];
        this.reporter = options.reporter || 'console';
    }

    getScreenshotOptions(options) {
        return {
            dir: options.dir,
            filePrefix: options.filePrefix || '',
            fileSuffix: options.fileSuffix || '',
            puppeteerOptions: options.puppeteerOptions,
            pageOptions: options.pageOptions
        }
    }

    _getDefaultFilePath({name}) {
        const {filePrefix, fileSuffix} = this.screenshotOptions;
        return `${this.dir}/${filePrefix}${name}${fileSuffix}`;
    }

    _getReferencePath(task) {
        return this._getDefaultFilePath(task) +
            '.' +
            this.fileType;
    }

    _getFailPath(task) {
        return this._getDefaultFilePath(task) +
            this.failFileSuffix +
            '.' +
            this.fileType;
    }

    _getDiffPath(task) {
        return this._getDefaultFilePath(task) +
            this.diffFileSuffix +
            '.' +
            this.fileType;
    }


    _getFilePaths(task) {
        return {
            reference: this._getReferencePath(task),
            fail: this._getFailPath(task),
            diff: this._getDiffPath(task),
        }
    }

    _compare({name, reference, fail, diff}) {
        const {tolerance} = this;
        let {errors} = this;
        let refFile;
        let failFile;

        try {
            refFile = fs.readFileSync(reference);
            failFile = fs.readFileSync(fail);
        } catch (e) {
            errors.push({
                name: name,
                message: e.message,
            });

            // Skip this test but still run the others.
            return new Promise((resolve, reject) => {
                resolve();
            });
        }

        return new Promise((resolve, reject) => {
            resemble(failFile).compareTo(refFile)
                .onComplete(function (data) {
                    if (Number(data.misMatchPercentage) >= tolerance) {

                        errors.push({
                            name: name,
                            message: `Mismatch of ${data.misMatchPercentage} for ${name}, see ${diff}`
                        });

                        data.getDiffImage().pack().pipe(fs.createWriteStream(diff));
                    } else {
                        fs.unlink(fail, () => {
                            console.log(`no error occured - removing ${fail}`);
                        });
                    }

                    resolve();
                });
        });
    }

    async run() {
        const taskList = flatten(this.tasks);

        let screenshotOptions = this.getScreenshotOptions(this.options);
        screenshotOptions.fileSuffix += this.failFileSuffix;
        await screenshot(this.tasks, screenshotOptions);

        return Promise.all(taskList.map((task) => {
            let paths = this._getFilePaths(task);

            return this._compare({
                name: task.name,
                reference: paths.reference,
                fail: paths.fail,
                diff: paths.diff,
            });
        }));
    }

    report() {
        if (this.reporter === 'xunit') {
            this._xUnitReport();
        } else {
            this._consoleReport();
        }
    }

    _xUnitReport() {
        const taskList = flatten(this.tasks);
        const {errors} = this;

        const testCases = taskList.reduce((result, task) => {
            const failure = errors.reduce((result, error) => {
                if (error.name === task.name) {
                    return `\n<failure type="failure" message="${error.message}" />\n`;
                } else {
                    return '';
                }
            }, '');

            result += `\n<testcase classname="headless-diff" name="${task.name}" time="0">${failure}</testcase>\n`;
            return result;
        }, '');

        const testSuite = `<testsuite name="Diff-Suite" tests="${taskList.length}" failures="${errors.length}" timestamp="${new Date().toUTCString()}" errors="0" skipped="0" time="0">${testCases}</testsuite>`;
        console.log(testSuite);
    }

    _consoleReport() {
        const taskList = flatten(this.tasks);
        const {errors} = this;

        let output = '';
        output += `Result ${new Date().toUTCString()}\n`;
        output += `${taskList.length} tests run\n`;
        output += `${errors.length} errors occured\n`;

        if (errors.length > 0) {
            output += 'Error-log\n';
            errors.forEach(({name, message}) => {
                output += `--> ${name}: ${message}\n`;
            });
        }

        console.log(output);
    }
};
