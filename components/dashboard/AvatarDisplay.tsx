/**
 * AvatarDisplay — unified wrapper that renders either a 3D Avatar (Babylon.js)
 * or the legacy 2D OperativeAvatar, depending on whether the player has selected
 * a 3D character model.
 *
 * Drop-in replacement for OperativeAvatar across the portal.
 */
import React from 'react';
import { ActiveCosmetics } from '../../types';
import OperativeAvatar from './OperativeAvatar';
import Avatar3D from './Avatar3D';
import { ENABLE_3D_AVATAR } from '../../lib/characterModels';

interface AvatarDisplayProps {
    /** 3D character model ID — if set, renders Avatar3D; otherwise falls back to 2D */
    characterModelId?: string;
    /** Equipment map for the 2D avatar */
    equipped?: Record<string, { rarity?: string; visualId?: string } | null | undefined>;
    /** Appearance settings for the 2D avatar */
    appearance?: {
        bodyType?: 'A' | 'B' | 'C';
        hue?: number;
        suitHue?: number;
        skinTone?: number;
        hairStyle?: number;
        hairColor?: number;
    };
    /** Active cosmetics for both 2D and 3D */
    activeCosmetics?: ActiveCosmetics;
    /** Evolution level for visual effects */
    evolutionLevel?: number;
    /** If true, render a compact/thumbnail version */
    compact?: boolean;
    /** CSS class for the container */
    className?: string;
    /** @deprecated Single cosmetic — kept for backward compat */
    activeCosmetic?: string;
}

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
    characterModelId,
    equipped = {},
    appearance,
    activeCosmetics,
    evolutionLevel,
    compact = false,
    className = '',
    activeCosmetic,
}) => {
    if (ENABLE_3D_AVATAR && characterModelId) {
        return (
            <Avatar3D
                characterModelId={characterModelId}
                appearance={appearance}
                activeCosmetics={activeCosmetics}
                evolutionLevel={evolutionLevel}
                equipped={equipped}
                compact={compact}
                className={className}
            />
        );
    }

    return (
        <OperativeAvatar
            equipped={equipped}
            appearance={appearance}
            activeCosmetics={activeCosmetics}
            activeCosmetic={activeCosmetic}
            evolutionLevel={evolutionLevel}
        />
    );
};

export default AvatarDisplay;
