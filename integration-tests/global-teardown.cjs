module.exports = async () => {
  await globalThis.medusaBirdTestPostgres?.stop();
};
