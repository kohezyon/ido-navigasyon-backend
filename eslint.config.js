const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    { ignores: ['**/node_modules/**', 'ido-navigasyon-personel/**', 'ido-navigasyon-mobil-v3/**'] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node
        }
    },
    {
        files: ['**/*.test.js'],
        languageOptions: {
            sourceType: 'module'
        }
    }
];
