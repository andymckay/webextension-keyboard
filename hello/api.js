class API extends ExtensionAPI {
  getAPI(context) {
    return {
      hello: {
        hello() {
          return Promise.resolve("Hello, world!");
        },
      },
    };
  }
}
