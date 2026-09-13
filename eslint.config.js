export default [
  {
    files: ['src/**/*.js', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        console: 'readonly',
        process: 'readonly',
        AudioContext: 'readonly',
        Audio: 'readonly',
        fetch: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        // Node-side, for the tools; they also run browser code via evaluate().
        Buffer: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // `catch (_)` is used deliberately for best-effort storage/audio calls.
      'no-unused-vars': ['warn', { args: 'after-used', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
];
