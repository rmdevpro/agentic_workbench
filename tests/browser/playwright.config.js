module.exports = {
  testDir: '.',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:7867',
    viewport: { width: 1280, height: 720 },
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  outputDir: 'screenshots',
};
