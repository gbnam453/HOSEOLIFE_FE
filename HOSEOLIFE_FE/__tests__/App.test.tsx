/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const mockAsyncStorage = {
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const ReactNative = require('react-native');

  const MockIcon = () => <ReactNative.View />;
  (MockIcon as typeof MockIcon & { loadFont: () => Promise<void> }).loadFont = () =>
    Promise.resolve();

  return MockIcon;
});
jest.mock('react-native-webview', () => {
  const ReactNative = require('react-native');

  return {
    WebView: () => <ReactNative.View />,
  };
});
jest.mock('react-native-image-zoom-viewer', () => {
  const ReactNative = require('react-native');

  return ({ children }: { children?: React.ReactNode }) => (
    <ReactNative.View>{children}</ReactNative.View>
  );
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});
