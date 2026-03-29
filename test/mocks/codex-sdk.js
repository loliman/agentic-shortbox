class Codex {
  startThread() {
    return {
      async run() {
        return {
          finalResponse: '',
          items: [],
        };
      },
    };
  }
}

module.exports = {
  Codex,
};
