const Diff = require('./Diff');

module.exports = async function (tasks, options) {
    const runner = new Diff(tasks, options);
    await runner.run();
    runner.report();
};
