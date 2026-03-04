module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|@react-native-community|react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler)/)',
  ],
};
