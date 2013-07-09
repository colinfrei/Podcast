'use strict';

// Declare app level module which depends on filters, and services
angular.module('podcasts', ['podcasts.services', 'podcasts.updater', 'podcasts.database', 'podcast.directives', 'podcasts.importer']).
    config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/feeds', {templateUrl: 'partials/listFeeds.html', controller: FeedListCtrl});
    $routeProvider.when('/feed/:feedId', {templateUrl: 'partials/feed.html', controller: FeedCtrl});
    $routeProvider.when('/queue', {templateUrl: 'partials/listQueue.html', controller: QueueListCtrl});
    $routeProvider.when('/settings', {templateUrl: 'partials/settings.html', controller: SettingsCtrl});
    $routeProvider.when('/import/google', {templateUrl: 'partials/importGoogle.html', controller: ImportCtrl});
    $routeProvider.when('/info', {templateUrl: 'partials/info.html', controller: InfoCtrl});
    $routeProvider.when('/dev', {templateUrl: 'partials/dev.html', controller: DevCtrl});
    $routeProvider.otherwise({redirectTo: '/queue'});
}]);