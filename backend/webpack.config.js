module.exports = function (options) {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      alias: {
        '@pugying/tenant-management': require('path').resolve(__dirname, 'libs/tenant-management/src'),
      },
    },
  };
};
