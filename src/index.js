const Diff = require('./Diff');

module.exports = async function (tasks, options) {
    const runner = new Diff(tasks, options);
    return runner.run().then(() => {
        runner.report();
    }).catch(() => {
        runner.report();
    })
};
