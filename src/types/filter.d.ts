/**
 * Type definitions for product filtering
 *
 * FilterGroup represents a group of filter options (such as "Product Category" and "Brand"),
 * and each group contains multiple FilterOption items for single selection.
 * Price range is handled separately and is not included in this structure.
 */

/**
 * Single filter option
 */
export interface FilterOption {
  /** Unique option identifier, corresponding to the value of the matching key in FilterValue */
  value: string | number;
  /** Display label */
  label: string;
}

/**
 * Filter group
 * key maps to a field in FilterValue, and the component reads and writes selected values via key
 */
export interface FilterGroup {
  /** Corresponds to a key in FilterValue, for example 'categoryId' */
  key: string;
  /** Group title, for example "Product Category" */
  label: string;
  /** Filter type; the current frontend treats it as single-select by default */
  type?: 'single' | 'multiple' | string;
  /** All options under this group */
  options: FilterOption[];
}

/**
 * Filter result value (key corresponds to FilterGroup.key)
 */
export interface FilterValue {
  [key: string]: string | number | undefined;
  minPrice?: number;
  maxPrice?: number;
}
