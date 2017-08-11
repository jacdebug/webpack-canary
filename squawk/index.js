import Gauge from 'gauge';
import { has } from 'lodash';
import { argv } from 'yargs';

import canaryRunner from '../lib/runner';
import { createRunList, generateSummary, loadConfig, logger, updateResultsForFailure, updateResultsForSuccess } from './utils';

/**
 * Run the squawk script
 *
 * @export
 * @return {Promise} Promise indicating the process success
 */
const runner = async function() {
  const config = loadConfig(argv);
  const startTime = new Date().getTime();
  const runList = createRunList(config);
  let results = {};
  let pulsing;
  let previousWebpack;

  const gauge = new Gauge();
  const updateGauge = (webpack, value) => !argv.verbose && gauge.show(`${webpack}`, value / runList.length);
  if (!argv.verbose) {
    gauge.show('webpack', 0);
  }

  try {
    for (const runItem of runList) {
      const index = runList.indexOf(runItem);
      const { webpack, dependency } = runItem;

      const webpackText = `${webpack}`;
      clearInterval(pulsing);
      updateGauge(webpack, index);
      if (previousWebpack !== webpackText) gauge.pulse('');
      pulsing = setInterval(() => gauge.pulse(`${dependency}`), 75);
      previousWebpack = webpackText;

      try {
        const examples = await canaryRunner(webpack, dependency, config);
        updateGauge(webpack, (index + 1));
        results = updateResultsForSuccess({ webpack, dependency, examples }, results);
      } catch (err) {
        updateGauge(webpack, (index + 1));
        const isExamplesError = has(err, 'examples');
        const examples = isExamplesError ? err.examples : undefined;
        const dependencyError = isExamplesError ? undefined : err;
        results = updateResultsForFailure({ webpack, dependency, examples }, dependencyError, results);
      }
    }

    setTimeout(function() {
      gauge.hide();
      generateSummary(results, startTime);
    }, 500);
  } catch (err) {
    gauge.hide();
    logger.error('Error ocurred running all combinations', err);
  }
}

export default function() {
  return runner()
    .catch((error) => {
      logger.error('Errors have occurred running examples');
      logger.error(error instanceof Error ? error.err || error.message : error);
      process.exit(1);
    });
}
