// Metro: permite importar os tipos e formatadores compartilhados do frontend web (@shared/*)
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../frontend/src/lib")];

module.exports = config;
