import uniHelper from '@uni-helper/eslint-config';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default uniHelper(
  {
    stylistic: false,
  },
  prettierRecommended,
  {
    rules: {
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-named-exports': 'off',
    },
  },
);
