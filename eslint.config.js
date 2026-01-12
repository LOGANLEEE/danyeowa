// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
import reactHooks from 'eslint-plugin-react-hooks';

const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  reactHooks.configs.flat.recommended,
  {
    ignores: ['dist/*'],
  },
]);
