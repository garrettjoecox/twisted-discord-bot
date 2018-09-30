
const _ = require('lodash');
const fs = require('fs-extra');
const FILEPATH = './data.json';

fs.ensureFileSync(FILEPATH);

module.exports = {
  get,
  set,
}

async function get(path, fallback) {
  const data = await fs.readJson(FILEPATH);
  return _.get(data, path, fallback);
}

async function set(path, value) {
  let data = await fs.readJson(FILEPATH);
  data = _.set(data, path, value);
  await fs.writeJson(FILEPATH, data, { spaces: 2 });

  return value;
}
