/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import { Text, TextInput } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

const MAIN_COMPONENT_NAME = 'HOSEOLIFE_FE';

Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.allowFontScaling = false;
Text.defaultProps.maxFontSizeMultiplier = 1;

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.allowFontScaling = false;
TextInput.defaultProps.maxFontSizeMultiplier = 1;

AppRegistry.registerComponent(MAIN_COMPONENT_NAME, () => App);

if (appName !== MAIN_COMPONENT_NAME) {
  AppRegistry.registerComponent(appName, () => App);
}
