module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo automatically wires up expo-router and the
    // react-native-worklets/reanimated plugin when those packages are present.
    presets: ['babel-preset-expo'],
  };
};
