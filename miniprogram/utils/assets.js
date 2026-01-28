/**
 * GreenBanana Asset Management Module
 * Centralizes management of static resources, animations, and placeholder configurations.
 * Supports switching between placeholder mode and production asset mode.
 */

const BASE_ASSET_PATH = '/asset/';

const ASSETS = {
  // Configuration flags
  config: {
    usePlaceholders: false, // Updated to false as user provided assets
  },

  // Avatar Resources
  avatars: {
    cat: {
      type: 'sequence',
      // Default/Idle image (Middle state of run)
      src: BASE_ASSET_PATH + 'cat_run_2.png', 
      placeholderColor: '#4CAF50', // Green fallback
      // Run/Walk Animation (1=Left, 2=Stand, 3=Right)
      sequences: {
        run: [
          BASE_ASSET_PATH + 'cat_run_1.png',
          BASE_ASSET_PATH + 'cat_run_2.png',
          BASE_ASSET_PATH + 'cat_run_3.png',
        ]
      }
    },
    user: {
      type: 'sequence',
      // Default/Idle image (Middle state of type)
      src: BASE_ASSET_PATH + 'cat_type_2.png',
      placeholderColor: '#E0E0E0',
      // Typing Animation (1=Right Hand, 2=Middle, 3=Left Hand)
      sequences: {
        type: [
          BASE_ASSET_PATH + 'cat_type_1.png',
          BASE_ASSET_PATH + 'cat_type_2.png',
          BASE_ASSET_PATH + 'cat_type_3.png',
        ]
      }
    }
  },

  // Card Entry Button (The 70% trigger)
  cardEntry: {
    // When usePlaceholders is true, components should render a shape with this color/text
    placeholder: {
      color: '#FFEB3B', // Match original yellow
      text: '生成卡片',
      shape: 'rect',
    },
    // Production asset
    image: {
      src: null, // No asset provided yet
    },
    // Animation configuration for the entry appearance
    animation: {
      type: 'fade-slide-up',
      duration: 500
    }
  },

  // Complex Animations (Sequence Frames)
  // Used for things like the "Card Maker" machine operating
  sequences: {
    cardProduction: null, // No assets provided yet
    tearCard: null // No assets provided yet
  }
};

/**
 * Helper to get resource path
 * @param {string} category - e.g., 'avatars', 'cardEntry'
 * @param {string} name - e.g., 'cat'
 */
const getAsset = (category, name) => {
  if (ASSETS[category] && ASSETS[category][name]) {
    return ASSETS[category][name];
  }
  return null;
};

module.exports = {
  ASSETS,
  getAsset
};
