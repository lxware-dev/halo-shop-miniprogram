/**
 * Type definitions for the home page
 * Kept aligned with the latest Mini Program home API.
 */

export type HomeLinkType = 'none' | 'product' | 'category';

export interface HomeBanner {
  title?: string;
  description?: string;
  imageUrl?: string;
  linkType?: HomeLinkType;
  linkValue?: string;
  priority?: number;
}

export interface HomeQuickEntry {
  title?: string;
  imageUrl?: string;
  linkType?: HomeLinkType;
  linkValue?: string;
  priority?: number;
}
