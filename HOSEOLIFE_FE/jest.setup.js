import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-community/netinfo', () => {
  const netInfoState = {
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: null,
  };

  return {
    __esModule: true,
    default: {
      addEventListener: jest.fn(() => jest.fn()),
      fetch: jest.fn(() => Promise.resolve(netInfoState)),
    },
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() => Promise.resolve(netInfoState)),
  };
});
