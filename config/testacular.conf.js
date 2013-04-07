basePath = '../';

files = [
  JASMINE,
  JASMINE_ADAPTER,
  'lib/angular/angular.js',
  'lib/angular/angular-*.js',
  'lib/ixDbEz.js',
  'lib/iscroll.js',
  'test/lib/angular/angular-mocks.js',
  'js/*.js',
  'test/unit/*.js',
  'test/unit/**/*.js',
  'test/fixtures/*'
];

autoWatch = true;

browsers = ['Chrome'];

junitReporter = {
  outputFile: 'test_out/unit.xml',
  suite: 'unit'
};