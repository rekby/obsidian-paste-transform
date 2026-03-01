// Mock for the obsidian module
module.exports = {
  Plugin: class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
    }
    async loadData() {
      return {};
    }
    async saveData() {}
    addCommand() {}
    addSettingTab() {}
    registerEvent() {}
  },
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {},
  TextAreaComponent: class TextAreaComponent {},
  App: class App {},
  Notice: class Notice {
    constructor(message, duration) {
      this.message = message;
      this.duration = duration;
    }
  },
  setIcon: (element, iconId) => {
    // Mock implementation - just sets a data attribute for testing
    if (element && iconId) {
      element.setAttribute('data-icon', iconId);
    }
  },
};
