import uniHelper from '@uni-helper/eslint-config';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default uniHelper(
  {
    stylistic: false,
  },
  prettierRecommended,
  {
    files: ['tests/*.test.mjs'],
    rules: {
      // Native Node tests need no additional test runner dependency.
      'test/no-import-node-test': 'off',
      // Use the JavaScript rule for .mjs; the TS-aware rule misclassifies runtime references.
      'unused-imports/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'error',
    },
  },
  {
    rules: {
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-named-exports': 'off',
    },
  },
);
