const packageJson = require('./package.json');

module.exports = {
  ...packageJson.build,
  extraResources: [
    ...(packageJson.build.extraResources || []),
    { from: 'build/runtime', to: 'runtime' },
    { from: 'build/manifests', to: 'manifests' },
  ],
};
