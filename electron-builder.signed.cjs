const candidateConfig = require('./electron-builder.release.cjs');

module.exports = {
  ...candidateConfig,
  directories: {
    output: 'dist/signed-release/app',
  },
  mac: {
    ...candidateConfig.mac,
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    type: 'distribution',
    // Leave identity discovery to electron-builder when CSC_LINK is used.
    // CSC_NAME can select an installed Developer ID Application identity.
    identity: process.env.CSC_NAME || undefined,
    notarize: true,
  },
};
