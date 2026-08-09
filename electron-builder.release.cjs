const baseConfig = require('./electron-builder.self-contained.cjs');

module.exports = {
  ...baseConfig,
  directories: {
    output: 'dist/release-candidate/app',
  },
  extraResources: [
    ...baseConfig.extraResources,
    { from: 'LICENSE', to: 'LICENSE' },
    { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
    { from: 'ACKNOWLEDGEMENTS.md', to: 'ACKNOWLEDGEMENTS.md' },
    { from: 'LICENSES', to: 'LICENSES' },
  ],
  mac: {
    ...baseConfig.mac,
    target: [{ target: 'dmg', arch: ['arm64'] }],
    artifactName: 'ScriptCut-${version}-${arch}.${ext}',
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    identity: null,
    notarize: false,
  },
};
