/**
 * ItemIcon — renders an RPG item's Quaternius icon PNG.
 *
 * Replaces the generic slot-shape SVGs with actual item artwork.
 * Falls back to a slot SVG silhouette if the image fails to load.
 */

import React, { useState } from 'react';
import { ItemRarity } from '../types';
import { getItemIconPath } from '../lib/itemIcons';

interface ItemIconProps {
  visualId: string;
  slot: string;
  rarity?: ItemRarity;
  /** Tailwind size classes, e.g. "w-6 h-6" or "w-10 h-10" */
  size?: string;
  /** Additional CSS classes */
  className?: string;
}

const ItemIcon: React.FC<ItemIconProps> = ({
  visualId,
  slot,
  rarity = 'COMMON',
  size = 'w-6 h-6',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const iconPath = getItemIconPath(visualId, slot, rarity);

  if (failed) {
    // Fallback: render a simple text label
    return (
      <span className={`${size} flex items-center justify-center text-[8px] font-bold text-gray-600 dark:text-gray-500 uppercase ${className}`}>
        {slot.slice(0, 4)}
      </span>
    );
  }

  return (
    <img
      src={iconPath}
      alt={`${slot} item`}
      className={`${size} object-contain drop-shadow-lg ${className}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
};

export default ItemIcon;
