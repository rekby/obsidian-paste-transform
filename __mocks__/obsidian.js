// Mock for the obsidian module
module.exports = {
  Plugin: class Plugin {
    async loadData() {
      return {};
    }
  },
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {},
  TextAreaComponent: class TextAreaComponent {},
  App: class App {},
};
